import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, test, vi } from 'vitest';
import { initSchema } from '../../src/db/index.js';
import { buildEmbeddings } from '../../src/domain/search/generator.js';
import { type EmbeddingPort, embedWithRecovery } from '../../src/domain/search/ports.js';
import { EngineError } from '../../src/shared/errors.js';

function vec(value: number): Float32Array {
  return new Float32Array([value, value + 0.5]);
}

describe('embedWithRecovery', () => {
  test('embeds a successful trusted batch in one port call', async () => {
    const port: EmbeddingPort = {
      embedBatch: vi.fn(async (texts) => texts.map((_, index) => vec(index))),
    };

    const result = await embedWithRecovery(port, ['a', 'b', 'c'], { batchSize: 3 });

    expect(port.embedBatch).toHaveBeenCalledTimes(1);
    expect(port.embedBatch).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(result).toEqual([vec(0), vec(1), vec(2)]);
  });

  test('recovers from a failed batch by splitting into smaller batches', async () => {
    const calls: string[][] = [];
    const port: EmbeddingPort = {
      embedBatch: vi.fn(async (texts) => {
        calls.push([...texts]);
        if (texts.length === 4) throw new Error('batch too large');
        return texts.map((text) => vec(text.charCodeAt(0)));
      }),
      reset: vi.fn(),
    };

    const result = await embedWithRecovery(port, ['a', 'b', 'c', 'd'], { batchSize: 4 });

    expect(calls).toEqual([
      ['a', 'b', 'c', 'd'],
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(port.reset).toHaveBeenCalledTimes(1);
    expect(result.map((v) => v[0])).toEqual([97, 98, 99, 100]);
  });

  test('falls back to individual items when smaller batches fail', async () => {
    const calls: string[][] = [];
    const port: EmbeddingPort = {
      embedBatch: vi.fn(async (texts) => {
        calls.push([...texts]);
        if (texts.length > 1) throw new Error(`cannot embed ${texts.length}`);
        return [vec(texts[0]!.length)];
      }),
      reset: vi.fn(),
    };

    const result = await embedWithRecovery(port, ['aa', 'bbb', 'c', 'dddd'], { batchSize: 4 });

    expect(calls).toEqual([
      ['aa', 'bbb', 'c', 'dddd'],
      ['aa', 'bbb'],
      ['aa'],
      ['bbb'],
      ['c', 'dddd'],
      ['c'],
      ['dddd'],
    ]);
    expect(port.reset).toHaveBeenCalledTimes(3);
    expect(result.map((v) => v[0])).toEqual([2, 3, 1, 4]);
  });

  test('reports partial item failures without dropping successful embeddings', async () => {
    const port: EmbeddingPort = {
      embedBatch: vi.fn(async (texts) => {
        if (texts.length > 1 || texts[0] === 'bad') throw new Error(`bad input: ${texts[0]}`);
        return [vec(texts[0]!.length)];
      }),
    };

    await expect(
      embedWithRecovery(port, ['good', 'bad', 'also-good'], { batchSize: 3 }),
    ).rejects.toThrow(/Failed to embed 1 of 3 item\(s\).*bad input: bad/s);
  });

  test('rethrows EngineError unchanged without retrying or wrapping', async () => {
    const engineError = new EngineError('install @huggingface/transformers', {
      code: 'ENGINE_UNAVAILABLE',
    });
    const port: EmbeddingPort = {
      embedBatch: vi.fn(async () => {
        throw engineError;
      }),
      reset: vi.fn(),
    };

    await expect(embedWithRecovery(port, ['a', 'b'], { batchSize: 2 })).rejects.toBe(engineError);
    expect(port.embedBatch).toHaveBeenCalledTimes(1);
    expect(port.embedBatch).toHaveBeenCalledWith(['a', 'b']);
    expect(port.reset).not.toHaveBeenCalled();
  });
});

describe('buildEmbeddings embedding port integration', () => {
  test('stores vectors and FTS rows from a mocked embedding port', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-port-integration-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'math.js'),
        'export function add(a, b) { return a + b; }\n',
      );
      fs.mkdirSync(path.join(tmpDir, '.codegraph'), { recursive: true });
      const dbPath = path.join(tmpDir, '.codegraph', 'graph.db');
      const db = new Database(dbPath);
      initSchema(db);
      const nodeId = db
        .prepare('INSERT INTO nodes (name, kind, file, line, end_line) VALUES (?, ?, ?, ?, ?)')
        .run('add', 'function', 'math.js', 1, 1).lastInsertRowid;
      db.close();

      const backing = new Float32Array([99, 0.25, 0.75, 100]);
      const vector = new Float32Array(backing.buffer, Float32Array.BYTES_PER_ELEMENT, 2);
      const port: EmbeddingPort = {
        embedBatch: vi.fn(async (texts) => texts.map(() => vector)),
      };

      await buildEmbeddings(tmpDir, 'minilm', dbPath, { strategy: 'source', embeddingPort: port });

      const embeddedText = (port.embedBatch as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
      expect(embeddedText).toContain('function add');
      expect(embeddedText).toContain('export function add(a, b) { return a + b; }');

      const readDb = new Database(dbPath, { readonly: true });
      const embedding = readDb
        .prepare('SELECT vector, full_text FROM embeddings WHERE node_id = ?')
        .get(nodeId) as { vector: Buffer; full_text: string };
      const fts = readDb
        .prepare('SELECT name, content FROM fts_index WHERE rowid = ?')
        .get(nodeId) as { name: string; content: string };
      const dim = readDb.prepare("SELECT value FROM embedding_meta WHERE key = 'dim'").get() as {
        value: string;
      };
      readDb.close();

      const stored = new Float32Array(
        embedding.vector.buffer,
        embedding.vector.byteOffset,
        embedding.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
      expect(Array.from(stored)).toEqual([0.25, 0.75]);
      expect(embedding.full_text).toBe(embeddedText);
      expect(fts).toEqual({ name: 'add', content: embedding.full_text });
      expect(dim.value).toBe('2');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
