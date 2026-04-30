import Database from 'better-sqlite3';
import { describe, expect, test, vi } from 'vitest';
import { initSchema } from '../../src/db/index.js';
import {
  createVectorIndex,
  decodeEmbedding,
  encodeEmbedding,
  sqliteVecDriver,
  type VectorAccelerationDriver,
  vectorStorageKey,
} from '../../src/domain/search/vector-index.js';

const meta = {
  modelUri: 'model-a',
  dimension: 3,
  strategy: 'structured',
  compatibilityProfile: 'default',
  formatterVersion: 'codegraph-symbol-text-v1',
};

function db() {
  const db = new Database(':memory:');
  initSchema(db);
  db.exec(`
    CREATE TABLE embeddings (node_id INTEGER PRIMARY KEY, vector BLOB NOT NULL, text_preview TEXT, full_text TEXT);
    INSERT INTO nodes (id, name, kind, file, line) VALUES (1, 'a', 'function', 'a.ts', 1), (2, 'b', 'function', 'b.ts', 2);
  `);
  return db;
}

function fakeDriver(overrides: Partial<VectorAccelerationDriver> = {}): VectorAccelerationDriver {
  return {
    load: vi.fn(),
    createTable: vi.fn((db, table) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (node_id INTEGER PRIMARY KEY, embedding BLOB NOT NULL)`,
      );
    }),
    upsert: vi.fn((db, table, rows) => {
      const insert = db.prepare(
        `INSERT OR REPLACE INTO ${table} (node_id, embedding) VALUES (?, ?)`,
      );
      for (const row of rows) insert.run(row.nodeId, encodeEmbedding(row.embedding));
    }),
    delete: vi.fn(),
    search: vi.fn((db, table, query, k) => {
      const rows = db.prepare(`SELECT node_id, embedding FROM ${table}`).all() as Array<{
        node_id: number;
        embedding: Buffer;
      }>;
      return rows
        .map((row) => {
          const vec = decodeEmbedding(row.embedding);
          const dot = query.reduce((sum, value, i) => sum + value * (vec[i] ?? 0), 0);
          return { nodeId: row.node_id, distance: 1 - dot };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, k);
    }),
    rebuild: vi.fn(),
    sync: vi.fn(() => ({ added: 0, removed: 0 })),
    ...overrides,
  };
}

describe('vector index acceleration', () => {
  test('encodes and decodes vectors without sharing the original buffer', () => {
    const vec = new Float32Array([1, 2, 3]);
    const blob = encodeEmbedding(vec);
    vec[0] = 9;
    expect(Array.from(decodeEmbedding(blob))).toEqual([1, 2, 3]);
  });

  test('stores vectors in model-aware storage and accelerated index when available', () => {
    const database = db();
    const driver = fakeDriver();
    const index = createVectorIndex(database, meta, { driver });

    const result = index.upsertVectors([
      {
        nodeId: 1,
        model: meta.modelUri,
        metadataKey: vectorStorageKey(meta),
        embedding: new Float32Array([1, 0, 0]),
      },
    ]);

    expect(result.ok).toBe(true);
    expect(index.searchAvailable).toBe(true);
    const stored = database
      .prepare('SELECT node_id, model_uri, metadata_key, dimension FROM embedding_vectors')
      .get() as any;
    expect(stored).toMatchObject({
      node_id: 1,
      model_uri: 'model-a',
      metadata_key: vectorStorageKey(meta),
      dimension: 3,
    });
    expect(driver.upsert).toHaveBeenCalled();
  });

  test('accelerated lookup is isolated by model metadata table', () => {
    const database = db();
    const driver = fakeDriver();
    const a = createVectorIndex(database, meta, { driver });
    const bMeta = { ...meta, modelUri: 'model-b' };
    const b = createVectorIndex(database, bMeta, { driver });
    a.upsertVectors([
      {
        nodeId: 1,
        model: meta.modelUri,
        metadataKey: vectorStorageKey(meta),
        embedding: new Float32Array([1, 0, 0]),
      },
    ]);
    b.upsertVectors([
      {
        nodeId: 2,
        model: bMeta.modelUri,
        metadataKey: vectorStorageKey(bMeta),
        embedding: new Float32Array([0, 1, 0]),
      },
    ]);

    const results = a.searchNearest(new Float32Array([1, 0, 0]), 10);

    expect(results.ok && results.value.map((r) => r.nodeId)).toEqual([1]);
  });

  test('falls back cleanly when optional acceleration cannot load', () => {
    const database = db();
    const index = createVectorIndex(database, meta, {
      driver: fakeDriver({
        load: () => {
          throw new Error('missing sqlite-vec');
        },
      }),
    });

    expect(index.searchAvailable).toBe(false);
    expect(
      index.upsertVectors([
        {
          nodeId: 1,
          model: meta.modelUri,
          metadataKey: vectorStorageKey(meta),
          embedding: new Float32Array([1, 0, 0]),
        },
      ]).ok,
    ).toBe(true);
    const results = index.searchNearest(new Float32Array([1, 0, 0]), 1);
    expect(results.ok).toBe(false);
    expect(results.error.code).toBe('VECTOR_SEARCH_UNAVAILABLE');
  });

  test('rejects vector rows whose metadata or dimension does not match the index', () => {
    const database = db();
    const index = createVectorIndex(database, meta, { driver: fakeDriver() });

    const result = index.upsertVectors([
      {
        nodeId: 1,
        model: meta.modelUri,
        metadataKey: vectorStorageKey(meta),
        embedding: new Float32Array([1, 0]),
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe('VECTOR_METADATA_MISMATCH');
    expect(database.prepare('SELECT COUNT(*) as count FROM embedding_vectors').get()).toMatchObject(
      {
        count: 0,
      },
    );
  });

  test('marks the accelerated index dirty when sync/rebuild writes fail but storage succeeds', () => {
    const database = db();
    const index = createVectorIndex(database, meta, {
      driver: fakeDriver({
        upsert: () => {
          throw new Error('vec write failed');
        },
        sync: () => {
          throw new Error('sync failed');
        },
        rebuild: () => {
          throw new Error('rebuild failed');
        },
      }),
    });

    const write = index.upsertVectors([
      {
        nodeId: 1,
        model: meta.modelUri,
        metadataKey: vectorStorageKey(meta),
        embedding: new Float32Array([1, 0, 0]),
      },
    ]);

    expect(write.ok).toBe(true);
    expect(index.vecDirty).toBe(true);
    expect(index.searchNearest(new Float32Array([1, 0, 0]), 1).ok).toBe(false);
    expect(index.syncVecIndex().ok).toBe(false);
    expect(index.rebuildVecIndex().ok).toBe(false);
  });

  test('persists dirty acceleration state across fresh index instances', () => {
    const database = db();
    const failing = createVectorIndex(database, meta, {
      driver: fakeDriver({
        upsert: () => {
          throw new Error('vec write failed');
        },
      }),
    });

    expect(
      failing.upsertVectors([
        {
          nodeId: 1,
          model: meta.modelUri,
          metadataKey: vectorStorageKey(meta),
          embedding: new Float32Array([1, 0, 0]),
        },
      ]).ok,
    ).toBe(true);

    const fresh = createVectorIndex(database, meta, { driver: fakeDriver() });

    expect(fresh.vecDirty).toBe(true);
    const result = fresh.searchNearest(new Float32Array([1, 0, 0]), 1);
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe('VECTOR_INDEX_DIRTY');
  });

  test('sqlite-vec driver binds vector table primary keys as bigint', () => {
    const calls: Array<{ sql: string; args: unknown[] }> = [];
    const database = {
      prepare: vi.fn((sql: string) => ({
        run: vi.fn((...args: unknown[]) => calls.push({ sql, args })),
      })),
      transaction: vi.fn((fn: () => void) => fn),
    };

    sqliteVecDriver.upsert(database as unknown as Database.Database, 'vec_test', [
      {
        nodeId: 42,
        model: meta.modelUri,
        metadataKey: vectorStorageKey(meta),
        embedding: new Float32Array([1, 0, 0]),
      },
    ]);

    expect(calls).toEqual([
      { sql: 'DELETE FROM vec_test WHERE node_id = ?', args: [42n] },
      {
        sql: 'INSERT INTO vec_test (node_id, embedding) VALUES (?, ?)',
        args: [42n, expect.any(Buffer)],
      },
    ]);
  });

  test('marks dirty before direct rebuild and sync mutate the accelerated index', () => {
    const database = db();
    let index: ReturnType<typeof createVectorIndex>;
    const driver = fakeDriver({
      rebuild: vi.fn(() => {
        expect(index.vecDirty).toBe(true);
      }),
      sync: vi.fn(() => {
        expect(index.vecDirty).toBe(true);
        return { added: 0, removed: 0 };
      }),
    });
    index = createVectorIndex(database, meta, { driver });

    expect(index.vecDirty).toBe(false);
    expect(index.rebuildVecIndex().ok).toBe(true);
    expect(index.vecDirty).toBe(false);
    expect(index.syncVecIndex().ok).toBe(true);
    expect(index.vecDirty).toBe(false);
  });

  test('rebuild removes stale accelerated rows left from a previous full embed', () => {
    const database = db();
    const driver = fakeDriver({
      rebuild: vi.fn((db, table, rows) => {
        db.exec(`DELETE FROM ${table}`);
        const insert = db.prepare(
          `INSERT OR REPLACE INTO ${table} (node_id, embedding) VALUES (?, ?)`,
        );
        for (const row of rows) insert.run(row.nodeId, encodeEmbedding(row.embedding));
      }),
    });
    const index = createVectorIndex(database, meta, { driver });
    const metadataKey = vectorStorageKey(meta);
    index.upsertVectors([
      {
        nodeId: 1,
        model: meta.modelUri,
        metadataKey,
        embedding: new Float32Array([1, 0, 0]),
      },
      {
        nodeId: 2,
        model: meta.modelUri,
        metadataKey,
        embedding: new Float32Array([0, 1, 0]),
      },
    ]);

    database.prepare('DELETE FROM embedding_vectors WHERE metadata_key = ?').run(metadataKey);
    index.upsertVectors([
      {
        nodeId: 1,
        model: meta.modelUri,
        metadataKey,
        embedding: new Float32Array([1, 0, 0]),
      },
    ]);
    expect(index.rebuildVecIndex().ok).toBe(true);

    const results = index.searchNearest(new Float32Array([0, 1, 0]), 10);
    expect(results.ok && results.value.map((r) => r.nodeId)).toEqual([1]);
  });
});
