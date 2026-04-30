import { openReadonlyOrFail } from '../../../db/index.js';
import { escapeLike } from '../../../db/query-builder.js';
import { getEmbeddingCount, getEmbeddingMeta } from '../../../db/repository/embeddings.js';
import type { BetterSqlite3Database } from '../../../types.js';
import type { EmbeddingMetadata } from '../metadata.js';
import { readEmbeddingMetadata } from '../metadata.js';
import { MODELS, resolveModelKey } from '../models.js';
import { applyFilters } from './filters.js';

export interface PreparedSearch {
  db: BetterSqlite3Database;
  rows: Array<{
    node_id: number;
    vector: Buffer;
    text_preview: string;
    full_text?: string | null;
    name: string;
    kind: string;
    file: string;
    line: number;
    end_line: number | null;
    role: string | null;
  }>;
  modelKey: string | null;
  storedDim: number | null;
  storedMetadata: EmbeddingMetadata;
}

export interface PrepareSearchOpts {
  model?: string;
  kind?: string;
  filePattern?: string | string[];
  noTests?: boolean;
}

export function prepareSearch(
  customDbPath: string | undefined,
  opts: PrepareSearchOpts = {},
): PreparedSearch | null {
  const db = openReadonlyOrFail(customDbPath) as BetterSqlite3Database;

  try {
    const count = getEmbeddingCount(db);
    if (count === 0) {
      console.log('No embeddings found. Run `codegraph embed` first.');
      db.close();
      return null;
    }

    const storedMetadata = readEmbeddingMetadata(db);
    const storedModel = storedMetadata.modelUri || getEmbeddingMeta(db, 'model') || null;
    const storedDim = storedMetadata.dimension ?? null;

    let modelKey = opts.model ? resolveModelKey(opts.model) : null;
    if (!modelKey && storedModel) {
      const resolvedStoredModel = resolveModelKey(storedModel);
      modelKey = MODELS[resolvedStoredModel] ? resolvedStoredModel : storedModel;
    }

    const hasFullTextColumn = (
      db.prepare("PRAGMA table_info('embeddings')").all() as Array<{ name: string }>
    ).some((column) => column.name === 'full_text');

    const fp = opts.filePattern;
    const fpArr = Array.isArray(fp) ? fp : fp ? [fp] : [];
    const isGlob = fpArr.length > 0 && fpArr.some((p) => /[*?[\]]/.test(p));
    let sql = `
    SELECT e.node_id, e.vector, e.text_preview, ${hasFullTextColumn ? 'e.full_text' : 'NULL'} AS full_text, n.name, n.kind, n.file, n.line, n.end_line, n.role
    FROM embeddings e
    JOIN nodes n ON e.node_id = n.id
  `;
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (opts.kind) {
      conditions.push('n.kind = ?');
      params.push(opts.kind);
    }
    if (fpArr.length > 0 && !isGlob) {
      if (fpArr.length === 1) {
        conditions.push("n.file LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(fpArr[0]!)}%`);
      } else {
        conditions.push(`(${fpArr.map(() => "n.file LIKE ? ESCAPE '\\'").join(' OR ')})`);
        params.push(...fpArr.map((f) => `%${escapeLike(f)}%`));
      }
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    let rows = db.prepare(sql).all(...params) as PreparedSearch['rows'];
    rows = applyFilters(rows, opts);

    return { db, rows, modelKey, storedDim, storedMetadata };
  } catch (err) {
    db.close();
    throw err;
  }
}
