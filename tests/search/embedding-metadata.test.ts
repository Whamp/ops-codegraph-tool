import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, test, vi } from 'vitest';
import { initSchema } from '../../src/db/index.js';
import { getEmbeddingMeta } from '../../src/db/repository/embeddings.js';
import {
  buildEmbeddings,
  EMBEDDING_FORMATTER_VERSION,
  readEmbeddingMetadata,
  searchData,
} from '../../src/domain/search/index.js';

const { QUERY_VECTORS } = vi.hoisted(() => ({
  QUERY_VECTORS: new Map<string, Float32Array>(),
}));

vi.mock('@huggingface/transformers', () => ({
  pipeline: async (_task: string, model: string) => {
    const dim =
      model.includes('jina-embeddings-v2-base-code') || model.includes('nomic') ? 768 : 384;
    const extractor = async (batch: string[]) => {
      const data = new Float32Array(dim * batch.length);
      for (let t = 0; t < batch.length; t++) {
        const vec = QUERY_VECTORS.get(batch[t]) ?? new Float32Array(dim);
        for (let i = 0; i < Math.min(dim, vec.length); i++) data[t * dim + i] = vec[i]!;
      }
      return { data };
    };
    extractor.dispose = async () => {};
    return extractor;
  },
  cos_sim: () => 0,
}));

function vec(dim: number, first = 1): Float32Array {
  const v = new Float32Array(dim);
  v[0] = first;
  return v;
}

function makeDb(dir: string): string {
  const dbPath = path.join(dir, 'graph.db');
  const db = new Database(dbPath);
  initSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      node_id INTEGER PRIMARY KEY,
      vector BLOB NOT NULL,
      text_preview TEXT,
      full_text TEXT,
      FOREIGN KEY(node_id) REFERENCES nodes(id)
    );
    CREATE TABLE IF NOT EXISTS embedding_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(name, content, tokenize='unicode61');
  `);
  db.prepare('INSERT INTO nodes (name, kind, file, line) VALUES (?, ?, ?, ?)').run(
    'findAuth',
    'function',
    'src/auth.ts',
    1,
  );
  db.close();
  return dbPath;
}

function seedSearchDb(dir: string, metadata: Record<string, string>): string {
  const dbPath = makeDb(dir);
  const db = new Database(dbPath);
  const nodeId = db.prepare('SELECT id FROM nodes LIMIT 1').get() as { id: number };
  const rowVec = vec(768);
  db.prepare(
    'INSERT INTO embeddings (node_id, vector, text_preview, full_text) VALUES (?, ?, ?, ?)',
  ).run(
    nodeId.id,
    Buffer.from(rowVec.buffer),
    'findAuth (function) -- src/auth.ts:1',
    'function findAuth() {}',
  );
  const insertMeta = db.prepare('INSERT INTO embedding_meta (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(metadata)) insertMeta.run(key, value);
  db.close();
  return dbPath;
}

describe('embedding metadata', () => {
  test('embed records legacy and model-aware metadata for fresh vectors', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-meta-fresh-'));
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(
        path.join(dir, 'src/auth.ts'),
        'export function findAuth() { return true; }\n',
      );
      const dbPath = makeDb(dir);

      await buildEmbeddings(dir, 'minilm', dbPath, {
        strategy: 'structured',
        embeddingPort: { embedBatch: async (texts) => texts.map(() => vec(384)) },
      });

      const db = new Database(dbPath, { readonly: true });
      expect(getEmbeddingMeta(db, 'model')).toBe('Xenova/all-MiniLM-L6-v2');
      expect(getEmbeddingMeta(db, 'dim')).toBe('384');
      expect(getEmbeddingMeta(db, 'strategy')).toBe('structured');
      expect(getEmbeddingMeta(db, 'built_at')).toMatch(/T/);
      expect(getEmbeddingMeta(db, 'model_uri')).toBe('Xenova/all-MiniLM-L6-v2');
      expect(getEmbeddingMeta(db, 'dimension')).toBe('384');
      expect(getEmbeddingMeta(db, 'compatibility_profile')).toBe('default');
      expect(getEmbeddingMeta(db, 'formatter_version')).toBe(EMBEDDING_FORMATTER_VERSION);
      expect(getEmbeddingMeta(db, 'build_timestamp')).toMatch(/T/);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('legacy metadata can still be read without new keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-meta-legacy-'));
    try {
      const dbPath = seedSearchDb(dir, {
        model: 'nomic-ai/nomic-embed-text-v1.5',
        dim: '768',
        strategy: 'structured',
        built_at: '2026-01-01T00:00:00.000Z',
      });
      const db = new Database(dbPath, { readonly: true });
      expect(readEmbeddingMetadata(db)).toMatchObject({
        modelUri: 'nomic-ai/nomic-embed-text-v1.5',
        dimension: 768,
        strategy: 'structured',
        builtAt: '2026-01-01T00:00:00.000Z',
        isLegacy: true,
      });
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('embed warns before rebuilding stale stored metadata', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-meta-embed-stale-'));
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(
        path.join(dir, 'src/auth.ts'),
        'export function findAuth() { return true; }\n',
      );
      const dbPath = makeDb(dir);
      const db = new Database(dbPath);
      const insertMeta = db.prepare('INSERT INTO embedding_meta (key, value) VALUES (?, ?)');
      insertMeta.run('model', 'Xenova/all-MiniLM-L6-v2');
      insertMeta.run('model_uri', 'Xenova/all-MiniLM-L6-v2');
      insertMeta.run('dim', '384');
      insertMeta.run('dimension', '384');
      insertMeta.run('strategy', 'structured');
      insertMeta.run('compatibility_profile', 'default');
      insertMeta.run('formatter_version', 'old-codegraph-symbol-format');
      db.close();

      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await buildEmbeddings(dir, 'minilm', dbPath, {
        strategy: 'structured',
        embeddingPort: { embedBatch: async (texts) => texts.map(() => vec(384)) },
      });
      const stderr = spy.mock.calls.map((c) => c[0]).join('');
      spy.mockRestore();
      expect(stderr).toContain('Stored embeddings may be stale');
      expect(stderr).toContain('formatter version');
      expect(stderr).toContain('codegraph embed --model minilm --strategy structured');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('search warns when stored model metadata does not match the active model', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-meta-model-mismatch-'));
    try {
      const dbPath = seedSearchDb(dir, {
        model: 'nomic-ai/nomic-embed-text-v1.5',
        model_uri: 'nomic-ai/nomic-embed-text-v1.5',
        dim: '768',
        dimension: '768',
        strategy: 'structured',
        compatibility_profile: 'default',
        formatter_version: EMBEDDING_FORMATTER_VERSION,
        built_at: '2026-01-01T00:00:00.000Z',
        build_timestamp: '2026-01-01T00:00:00.000Z',
      });
      QUERY_VECTORS.set('auth', vec(768));
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await searchData('auth', dbPath, { model: 'jina-code', minScore: 0.1 });
      const stderr = spy.mock.calls.map((c) => c[0]).join('');
      spy.mockRestore();
      expect(stderr).toContain('Stored embeddings may be stale');
      expect(stderr).toContain('model URI');
      expect(stderr).toContain('codegraph embed');
      expect(stderr).toContain('jina-code');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('search warns when stored formatter metadata does not match the active formatter', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-meta-formatter-mismatch-'));
    try {
      const dbPath = seedSearchDb(dir, {
        model: 'nomic-ai/nomic-embed-text-v1.5',
        model_uri: 'nomic-ai/nomic-embed-text-v1.5',
        dim: '768',
        dimension: '768',
        strategy: 'structured',
        compatibility_profile: 'default',
        formatter_version: 'old-codegraph-symbol-format',
        built_at: '2026-01-01T00:00:00.000Z',
        build_timestamp: '2026-01-01T00:00:00.000Z',
      });
      QUERY_VECTORS.set('auth', vec(768));
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await searchData('auth', dbPath, { minScore: 0.1 });
      const stderr = spy.mock.calls.map((c) => c[0]).join('');
      spy.mockRestore();
      expect(stderr).toContain('Stored embeddings may be stale');
      expect(stderr).toContain('formatter version');
      expect(stderr).toContain('codegraph embed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
