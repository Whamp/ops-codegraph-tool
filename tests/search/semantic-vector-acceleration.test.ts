import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { initSchema } from '../../src/db/index.js';

const QUERY_VECTORS = new Map<string, Float32Array>();

vi.mock('@huggingface/transformers', () => ({
  pipeline: async () => {
    const extractor = async (batch: string[]) => ({
      data: QUERY_VECTORS.get(batch[0]!) ?? new Float32Array(384),
    });
    extractor.dispose = async () => {};
    return extractor;
  },
  cos_sim: () => 0,
}));

import {
  type ActiveEmbeddingMetadata,
  createVectorIndex,
  encodeEmbedding,
  searchData,
  setVectorAccelerationDriverForTests,
  type VectorAccelerationDriver,
  vectorStorageKey,
  vectorTableName,
} from '../../src/domain/search/index.js';

function makeVec(components: number[]): Float32Array {
  const vec = new Float32Array(384);
  for (let i = 0; i < components.length; i++) vec[i] = components[i]!;
  return vec;
}

const active: ActiveEmbeddingMetadata = {
  modelUri: 'Xenova/all-MiniLM-L6-v2',
  dimension: 384,
  strategy: 'structured',
  compatibilityProfile: 'default',
  formatterVersion: 'codegraph-symbol-text-v1',
};

function fakeDriver(searchImpl?: VectorAccelerationDriver['search']): VectorAccelerationDriver {
  return {
    load: vi.fn(),
    createTable: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    rebuild: vi.fn(),
    sync: vi.fn(() => ({ added: 0, removed: 0 })),
    search: vi.fn(searchImpl ?? ((_db, _table, _query, _k) => [{ nodeId: 2, distance: 0.01 }])),
  };
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-vec-search-'));
  const dbPath = path.join(dir, 'graph.db');
  const db = new Database(dbPath);
  initSchema(db);
  db.exec(`
    CREATE TABLE embeddings (node_id INTEGER PRIMARY KEY, vector BLOB NOT NULL, text_preview TEXT, full_text TEXT);
    CREATE TABLE embedding_meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO nodes (id, name, kind, file, line) VALUES
      (1, 'bruteForceWinner', 'function', 'a.ts', 1),
      (2, 'acceleratedWinner', 'function', 'b.ts', 2);
  `);
  db.prepare(
    'INSERT INTO embeddings (node_id, vector, text_preview, full_text) VALUES (?, ?, ?, ?)',
  ).run(1, encodeEmbedding(makeVec([1, 0])), 'brute', 'brute');
  db.prepare(
    'INSERT INTO embeddings (node_id, vector, text_preview, full_text) VALUES (?, ?, ?, ?)',
  ).run(2, encodeEmbedding(makeVec([0, 1])), 'accelerated', 'accelerated');
  const meta = db.prepare('INSERT INTO embedding_meta (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries({
    model: active.modelUri,
    dim: String(active.dimension),
    model_uri: active.modelUri,
    dimension: String(active.dimension),
    strategy: active.strategy!,
    compatibility_profile: active.compatibilityProfile,
    formatter_version: active.formatterVersion,
    count: '2',
  }))
    meta.run(key, value);
  db.exec(
    `CREATE TABLE ${vectorTableName(active)} (node_id INTEGER PRIMARY KEY, embedding BLOB NOT NULL)`,
  );
  db.prepare(`INSERT INTO ${vectorTableName(active)} (node_id, embedding) VALUES (?, ?)`).run(
    2,
    encodeEmbedding(makeVec([0, 1])),
  );
  db.exec(
    `CREATE TABLE embedding_vectors (node_id INTEGER, model_uri TEXT, metadata_key TEXT, dimension INTEGER, vector BLOB, updated_at TEXT, PRIMARY KEY(node_id, metadata_key))`,
  );
  db.prepare(
    'INSERT INTO embedding_vectors (node_id, model_uri, metadata_key, dimension, vector, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
  ).run(
    2,
    active.modelUri,
    vectorStorageKey(active),
    active.dimension,
    encodeEmbedding(makeVec([0, 1])),
  );
  db.close();
  QUERY_VECTORS.set('query', makeVec([1, 0]));
  return { dir, dbPath };
}

afterEach(() => {
  setVectorAccelerationDriverForTests(undefined);
});

describe('semantic search vector acceleration', () => {
  test('uses accelerated KNN results when the optional driver is available', async () => {
    const { dir, dbPath } = fixture();
    const driver = fakeDriver();
    setVectorAccelerationDriverForTests(driver);

    const result = await searchData('query', dbPath, { minScore: 0 });

    expect(result?.results.map((r) => r.name)).toEqual(['acceleratedWinner']);
    expect(driver.search).toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('falls back to brute-force semantic search when accelerated lookup fails', async () => {
    const { dir, dbPath } = fixture();
    setVectorAccelerationDriverForTests(
      fakeDriver(() => {
        throw new Error('knn unavailable');
      }),
    );

    const result = await searchData('query', dbPath, { minScore: 0.9 });

    expect(result?.results.map((r) => r.name)).toEqual(['bruteForceWinner']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('uses brute-force semantic search when filters are active so filtered top-k is complete', async () => {
    const { dir, dbPath } = fixture();
    const driver = fakeDriver((_db, _table, _query, k) =>
      [{ nodeId: 2, distance: 0.01 }].slice(0, k),
    );
    setVectorAccelerationDriverForTests(driver);

    const result = await searchData('query', dbPath, {
      minScore: 0,
      kind: 'function',
      filePattern: 'a.ts',
    });

    expect(result?.results.map((r) => r.name)).toEqual(['bruteForceWinner']);
    expect(driver.search).not.toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('falls back to brute force in a fresh process after persisted dirty acceleration state', async () => {
    const { dir, dbPath } = fixture();
    const writerDb = new Database(dbPath);
    const dirty = createVectorIndex(writerDb, active, {
      driver: fakeDriver(() => [{ nodeId: 2, distance: 0.01 }]),
    });
    dirty.vecDirty = true;
    writerDb.close();
    const driver = fakeDriver(() => [{ nodeId: 2, distance: 0.01 }]);
    setVectorAccelerationDriverForTests(driver);

    const result = await searchData('query', dbPath, { minScore: 0.9 });

    expect(result?.results.map((r) => r.name)).toEqual(['bruteForceWinner']);
    expect(driver.search).not.toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
