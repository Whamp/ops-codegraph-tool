import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { warn } from '../../infrastructure/logger.js';
import type { BetterSqlite3Database } from '../../types.js';
import type { ActiveEmbeddingMetadata } from './metadata.js';

export type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

function ok<T>(value: T): StoreResult<T> {
  return { ok: true, value };
}

function err<T>(code: string, message: string): StoreResult<T> {
  return { ok: false, error: { code, message } };
}

export interface VectorRow {
  nodeId: number;
  model: string;
  metadataKey: string;
  embedding: Float32Array;
}

export interface VectorSearchResult {
  nodeId: number;
  distance: number;
  similarity: number;
}

export interface VectorAccelerationDriver {
  load(db: BetterSqlite3Database): void;
  createTable(db: BetterSqlite3Database, tableName: string, dimensions: number): void;
  upsert(db: BetterSqlite3Database, tableName: string, rows: VectorRow[]): void;
  delete(db: BetterSqlite3Database, tableName: string, nodeIds: number[]): void;
  search(
    db: BetterSqlite3Database,
    tableName: string,
    embedding: Float32Array,
    k: number,
  ): Array<{ nodeId: number; distance: number }>;
  rebuild(db: BetterSqlite3Database, tableName: string, rows: VectorRow[]): void;
  sync(
    db: BetterSqlite3Database,
    tableName: string,
    rows: VectorRow[],
  ): { added: number; removed: number };
}

export interface VectorIndex {
  readonly searchAvailable: boolean;
  readonly loadError?: string;
  readonly guidance?: string;
  readonly tableName: string;
  readonly metadataKey: string;
  vecDirty: boolean;
  upsertVectors(rows: VectorRow[]): StoreResult<void>;
  deleteVectors(nodeIds: number[]): StoreResult<void>;
  searchNearest(
    embedding: Float32Array,
    k: number,
    options?: { minScore?: number },
  ): StoreResult<VectorSearchResult[]>;
  rebuildVecIndex(): StoreResult<void>;
  syncVecIndex(): StoreResult<{ added: number; removed: number }>;
}

export interface CreateVectorIndexOptions {
  driver?: VectorAccelerationDriver;
  mode?: 'storage' | 'search';
}

const SQLITE_VEC_GUIDANCE =
  'Install sqlite-vec support to enable accelerated vector search; brute-force semantic search remains available.';

export function encodeEmbedding(f32: Float32Array): Buffer {
  return Buffer.from(f32.buffer.slice(f32.byteOffset, f32.byteOffset + f32.byteLength));
}

export function decodeEmbedding(blob: Uint8Array): Float32Array {
  if (blob.byteLength % 4 !== 0) {
    throw new Error(`Invalid embedding blob: length ${blob.byteLength} is not aligned to 4 bytes`);
  }
  const copy = new Uint8Array(blob);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

export function vectorStorageKey(metadata: ActiveEmbeddingMetadata): string {
  return [
    metadata.modelUri,
    metadata.dimension ?? '',
    metadata.strategy ?? '',
    metadata.compatibilityProfile,
    metadata.formatterVersion,
  ].join('\u001f');
}

export function vectorTableName(metadata: ActiveEmbeddingMetadata): string {
  const hash = createHash('sha256').update(vectorStorageKey(metadata)).digest('hex').slice(0, 16);
  return `vec_embeddings_${hash}`;
}

function ensureStorageTable(db: BetterSqlite3Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_vectors (
      node_id INTEGER NOT NULL,
      model_uri TEXT NOT NULL,
      metadata_key TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      vector BLOB NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (node_id, metadata_key),
      FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_embedding_vectors_model ON embedding_vectors(metadata_key, node_id);
  `);
}

function readRows(db: BetterSqlite3Database, metadataKey: string, modelUri: string): VectorRow[] {
  const rows = db
    .prepare(
      'SELECT node_id, vector FROM embedding_vectors WHERE metadata_key = ? AND model_uri = ? ORDER BY node_id',
    )
    .all(metadataKey, modelUri) as Array<{ node_id: number; vector: Buffer }>;
  return rows.map((row) => ({
    nodeId: row.node_id,
    model: modelUri,
    metadataKey,
    embedding: decodeEmbedding(row.vector),
  }));
}

export const sqliteVecDriver: VectorAccelerationDriver = {
  load(db) {
    const require = createRequire(import.meta.url);
    const sqliteVec = require('sqlite-vec') as {
      load?: (db: BetterSqlite3Database) => void;
      loadablePath?: string;
      default?: { load?: (db: BetterSqlite3Database) => void; loadablePath?: string };
    };
    const load = sqliteVec.load ?? sqliteVec.default?.load;
    if (load) {
      load(db);
      return;
    }
    const loadablePath = sqliteVec.loadablePath ?? sqliteVec.default?.loadablePath;
    const loadExtension = (db as unknown as { loadExtension?: (path: string) => void })
      .loadExtension;
    if (loadablePath && loadExtension) {
      loadExtension.call(db, loadablePath);
      return;
    }
    throw new Error('sqlite-vec package did not expose a compatible loader');
  },
  createTable(db, tableName, dimensions) {
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName} USING vec0(node_id INTEGER PRIMARY KEY, embedding FLOAT[${dimensions}] distance_metric=cosine);`,
    );
  },
  upsert(db, tableName, rows) {
    const del = db.prepare(`DELETE FROM ${tableName} WHERE node_id = ?`);
    const insert = db.prepare(`INSERT INTO ${tableName} (node_id, embedding) VALUES (?, ?)`);
    const tx = db.transaction(() => {
      for (const row of rows) {
        del.run(row.nodeId);
        insert.run(row.nodeId, encodeEmbedding(row.embedding));
      }
    });
    tx();
  },
  delete(db, tableName, nodeIds) {
    const del = db.prepare(`DELETE FROM ${tableName} WHERE node_id = ?`);
    const tx = db.transaction(() => {
      for (const nodeId of nodeIds) del.run(nodeId);
    });
    tx();
  },
  search(db, tableName, embedding, k) {
    return db
      .prepare(
        `SELECT node_id as nodeId, distance FROM ${tableName} WHERE embedding MATCH ? AND k = ?`,
      )
      .all(encodeEmbedding(embedding), k) as Array<{ nodeId: number; distance: number }>;
  },
  rebuild(db, tableName, rows) {
    db.exec(`DELETE FROM ${tableName}`);
    this.upsert(db, tableName, rows);
  },
  sync(db, tableName, rows) {
    this.rebuild(db, tableName, rows);
    return { added: rows.length, removed: 0 };
  },
};

let testVectorAccelerationDriver: VectorAccelerationDriver | undefined;

export function setVectorAccelerationDriverForTests(
  driver: VectorAccelerationDriver | undefined,
): void {
  testVectorAccelerationDriver = driver;
}

export function createVectorIndex(
  db: BetterSqlite3Database,
  metadata: ActiveEmbeddingMetadata,
  options: CreateVectorIndexOptions = {},
): VectorIndex {
  const metadataKey = vectorStorageKey(metadata);
  const tableName = vectorTableName(metadata);
  const driver = options.driver ?? testVectorAccelerationDriver ?? sqliteVecDriver;
  let searchAvailable = false;
  let loadError: string | undefined;
  let vecDirty = false;

  try {
    if (options.mode !== 'search') ensureStorageTable(db);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  try {
    driver.load(db);
    if (options.mode !== 'search') {
      driver.createTable(db, tableName, metadata.dimension ?? 0);
    }
    searchAvailable = true;
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    searchAvailable = false;
  }

  function storageRows(): VectorRow[] {
    return readRows(db, metadataKey, metadata.modelUri);
  }

  return {
    get searchAvailable() {
      return searchAvailable;
    },
    get loadError() {
      return loadError;
    },
    get guidance() {
      return searchAvailable ? undefined : SQLITE_VEC_GUIDANCE;
    },
    tableName,
    metadataKey,
    get vecDirty() {
      return vecDirty;
    },
    set vecDirty(value: boolean) {
      vecDirty = value;
    },
    upsertVectors(rows) {
      try {
        ensureStorageTable(db);
        const insert = db.prepare(
          `INSERT OR REPLACE INTO embedding_vectors (node_id, model_uri, metadata_key, dimension, vector, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        );
        const tx = db.transaction(() => {
          for (const row of rows) {
            insert.run(
              row.nodeId,
              row.model,
              row.metadataKey,
              row.embedding.length,
              encodeEmbedding(row.embedding),
            );
          }
        });
        tx();
      } catch (error) {
        return err(
          'VECTOR_WRITE_FAILED',
          `Vector write failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (searchAvailable) {
        try {
          driver.upsert(
            db,
            tableName,
            rows.filter((row) => row.metadataKey === metadataKey),
          );
        } catch (error) {
          vecDirty = true;
          warn(
            `Vector acceleration write failed; falling back to brute-force search until sync succeeds: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return ok(undefined);
    },
    deleteVectors(nodeIds) {
      try {
        ensureStorageTable(db);
        const del = db.prepare(
          'DELETE FROM embedding_vectors WHERE node_id = ? AND metadata_key = ?',
        );
        const tx = db.transaction(() => {
          for (const nodeId of nodeIds) del.run(nodeId, metadataKey);
        });
        tx();
      } catch (error) {
        return err(
          'VECTOR_DELETE_FAILED',
          `Vector delete failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (searchAvailable) {
        try {
          driver.delete(db, tableName, nodeIds);
        } catch {
          vecDirty = true;
        }
      }
      return ok(undefined);
    },
    searchNearest(embedding, k, searchOptions) {
      if (!searchAvailable) {
        return err(
          'VECTOR_SEARCH_UNAVAILABLE',
          `Vector acceleration is unavailable. ${loadError ? `Reason: ${loadError}. ` : ''}${SQLITE_VEC_GUIDANCE}`,
        );
      }
      try {
        const rows = driver.search(db, tableName, embedding, k);
        const minScore = searchOptions?.minScore;
        return ok(
          rows
            .map((row) => ({
              nodeId: row.nodeId,
              distance: row.distance,
              similarity: 1 - row.distance,
            }))
            .filter((row) => minScore === undefined || row.similarity >= minScore),
        );
      } catch (error) {
        return err(
          'VECTOR_SEARCH_FAILED',
          `Vector acceleration search failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    rebuildVecIndex() {
      if (!searchAvailable) return ok(undefined);
      try {
        driver.rebuild(db, tableName, storageRows());
        vecDirty = false;
        return ok(undefined);
      } catch (error) {
        vecDirty = true;
        return err(
          'VECTOR_REBUILD_FAILED',
          `Vector acceleration rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    syncVecIndex() {
      if (!searchAvailable) return ok({ added: 0, removed: 0 });
      try {
        const result = driver.sync(db, tableName, storageRows());
        vecDirty = false;
        return ok(result);
      } catch (error) {
        vecDirty = true;
        return err(
          'VECTOR_SYNC_FAILED',
          `Vector acceleration sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
