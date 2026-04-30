import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  createEmbeddingPort,
  formatEmbeddingDocument,
  formatEmbeddingQuery,
  HttpEmbeddingPort,
  ModelCache,
  parseModelUri,
  resolveDownloadPolicy,
  validateGgufFile,
} from '../../src/domain/search/index.js';

function ggufFile(dir: string, name = 'model.gguf'): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from([0x47, 0x47, 0x55, 0x46, 0, 0]));
  return file;
}

describe('Qwen embedding compatibility formatting', () => {
  test('formats Qwen queries with instruct-style prompt and keeps documents raw', () => {
    const uri = 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf';

    expect(formatEmbeddingQuery('find auth middleware', uri)).toBe(
      'Instruct: Given a code search query, retrieve relevant code symbols and implementation details.\nQuery: find auth middleware',
    );
    expect(formatEmbeddingDocument('function authMiddleware() {}', uri)).toBe(
      'function authMiddleware() {}',
    );
  });

  test('preserves legacy document text for default transformer profile', () => {
    expect(formatEmbeddingDocument('function add() {}', 'minilm')).toBe('function add() {}');
  });
});

describe('model URI parsing, GGUF validation, and download policy', () => {
  test('parses hf explicit GGUF, hf quant shorthand, file URLs, and absolute paths', () => {
    expect(parseModelUri('hf:Qwen/Qwen3-Embedding-0.6B-GGUF/model.gguf')).toEqual({
      scheme: 'hf',
      org: 'Qwen',
      repo: 'Qwen3-Embedding-0.6B-GGUF',
      file: 'model.gguf',
    });
    expect(parseModelUri('hf:Qwen/Qwen3-Embedding-0.6B-GGUF:Q4_K_M')).toMatchObject({
      scheme: 'hf',
      quantization: 'Q4_K_M',
    });

    const absolute = path.resolve('/tmp/model.gguf');
    expect(parseModelUri(`file://${absolute}`).scheme).toBe('file');
    expect(parseModelUri(absolute)).toEqual({ scheme: 'file', file: absolute });
  });

  test('rejects missing, HTML-intercepted, and non-GGUF files with actionable errors', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-gguf-'));
    try {
      await expect(validateGgufFile(path.join(tmp, 'missing.gguf'))).rejects.toThrow(/not found/i);
      const html = path.join(tmp, 'html.gguf');
      fs.writeFileSync(html, '<html>huggingface login</html>');
      await expect(validateGgufFile(html, 'hf:x/y/model.gguf')).rejects.toThrow(/looks like HTML/i);
      const bad = path.join(tmp, 'bad.gguf');
      fs.writeFileSync(bad, 'nope');
      await expect(validateGgufFile(bad)).rejects.toThrow(/missing GGUF magic/i);
      await expect(validateGgufFile(ggufFile(tmp))).resolves.toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('reports offline and no-auto-download cache misses without downloading', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-cache-'));
    try {
      const cache = new ModelCache(tmp);
      await expect(
        cache.ensureModel('hf:Qwen/Qwen3-Embedding-0.6B-GGUF/model.gguf', 'embed', {
          offline: true,
          allowDownload: false,
        }),
      ).rejects.toThrow(/offline mode/i);
      await expect(
        cache.ensureModel('hf:Qwen/Qwen3-Embedding-0.6B-GGUF/model.gguf', 'embed', {
          offline: false,
          allowDownload: false,
        }),
      ).rejects.toThrow(/automatic downloads are disabled/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('resolves policy from env with offline taking precedence', () => {
    expect(resolveDownloadPolicy({ HF_HUB_OFFLINE: '1', CODEGRAPH_NO_AUTO_DOWNLOAD: '1' })).toEqual(
      {
        offline: true,
        allowDownload: false,
      },
    );
    expect(resolveDownloadPolicy({ CODEGRAPH_NO_AUTO_DOWNLOAD: 'true' })).toEqual({
      offline: false,
      allowDownload: false,
    });
  });
});

describe('HTTP embedding port', () => {
  test('calls OpenAI-compatible endpoint and orders vectors by response index', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }),
    } as Response);
    try {
      const port = new HttpEmbeddingPort('http://localhost:8000/v1/embeddings#qwen');
      const vectors = await port.embedBatch(['a', 'b']);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ input: ['a', 'b'], model: 'qwen' }),
        }),
      );
      expect(vectors.map((vector) => Array.from(vector))).toEqual([
        [1, 0],
        [0, 1],
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('embedding port factory', () => {
  test('creates Qwen GGUF port from local file without requiring node-llama-cpp until used', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-factory-'));
    try {
      const file = ggufFile(tmp, 'Qwen3-Embedding.gguf');
      const runtimeLoader = vi.fn(async () => ({
        getLlama: async () => ({
          loadModel: async () => ({
            createEmbeddingContext: async () => ({
              getEmbeddingFor: async (text: string) => ({
                vector: [text.includes('Instruct:') ? 1 : 0, 2],
              }),
            }),
          }),
        }),
      }));

      const port = await createEmbeddingPort(`file:${file}`, { inputType: 'query', runtimeLoader });
      const [vector] = await port.embedBatch(['find parser']);
      expect(runtimeLoader).toHaveBeenCalledTimes(1);
      expect(Array.from(vector!)).toEqual([1, 2]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('wraps HTTP ports with Qwen query formatting when URI identifies Qwen', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: [1] }] }),
    } as Response);
    try {
      const port = await createEmbeddingPort('https://example.test/v1/embeddings#Qwen3-Embedding', {
        inputType: 'query',
      });
      await port.embedBatch(['auth']);
      const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
        input: string[];
      };
      expect(body.input[0]).toMatch(/^Instruct:.*Query: auth/s);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
