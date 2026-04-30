import { openReadonlyOrFail } from '../../../db/index.js';
import { DEFAULTS, loadConfig } from '../../../infrastructure/config.js';
import type { BetterSqlite3Database, CodegraphConfig } from '../../../types.js';
import { hasFtsIndex } from '../stores/fts5.js';
import { routeExpandedQueries } from './expansion.js';
import {
  type FusionExplain,
  type FusionSource,
  type FusionWeights,
  type RankedFusionInput,
  weightedRrfFuse,
} from './fusion.js';
import { ftsSearchData } from './keyword.js';
import type { SemanticSearchOpts } from './semantic.js';
import { searchData } from './semantic.js';

interface HybridResult {
  name: string;
  kind: string;
  file: string;
  line: number;
  endLine: number | null;
  role: string | null;
  fileHash: string | null;
  rrf: number;
  bm25Score: number | null;
  bm25Rank: number | null;
  similarity: number | null;
  semanticRank: number | null;
  explain?: FusionExplain;
}

export interface HybridSearchResult {
  results: HybridResult[];
}

interface RankedPayload {
  source: FusionSource;
  name: string;
  kind: string;
  file: string;
  line: number;
  endLine?: number | null;
  role?: string | null;
  fileHash?: string | null;
  bm25Score?: number;
  similarity?: number;
}

/** Parse a semicolon-delimited query string into individual queries. */
function parseQueries(query: string): string[] {
  return query
    .split(';')
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
}

/** Collect BM25 and semantic ranked lists for each query. */
async function collectRankedLists(
  queries: string[],
  customDbPath: string | undefined,
  opts: SemanticSearchOpts,
  topK: number,
): Promise<RankedFusionInput<RankedPayload>[]> {
  const rankedLists: RankedFusionInput<RankedPayload>[] = [];

  for (const q of queries) {
    const original = q.trim();
    const expansionEnabled = opts.expand ?? false;
    const hasStructuredModes = (opts.queryModes?.length ?? 0) > 0;
    const bm25Probe =
      expansionEnabled && !hasStructuredModes
        ? ftsSearchData(q, customDbPath, { ...opts, limit: Math.min(topK, 5) })
        : null;
    const routed = await routeExpandedQueries(
      q,
      {
        enabled: expansionEnabled,
        provider: opts.expansionProvider,
        timeoutMs: opts.expansionTimeoutMs,
        queryModes: opts.queryModes,
        queryTextKind: opts.queryTextKind,
      },
      bm25Probe?.results ?? [],
    );
    const queryTextKind = opts.queryTextKind ?? 'plain';

    for (const bm25Query of routed.bm25Queries) {
      const source: FusionSource =
        bm25Query === original && (queryTextKind === 'plain' || queryTextKind === 'term')
          ? 'bm25'
          : 'bm25_variant';
      const bm25Data = ftsSearchData(bm25Query, customDbPath, { ...opts, limit: topK });
      if (bm25Data?.results) {
        rankedLists.push({
          source,
          query: bm25Query,
          results: bm25Data.results.map((result, idx) => ({
            key: `${result.name}:${result.file}:${result.line}`,
            rank: idx + 1,
            payload: { source, ...result },
          })),
        });
      }
    }

    for (const semanticQuery of routed.semanticQueries) {
      const source: FusionSource =
        routed.expansion?.hyde && semanticQuery === routed.expansion.hyde
          ? 'hyde'
          : semanticQuery === original && (queryTextKind === 'plain' || queryTextKind === 'intent')
            ? 'vector'
            : 'vector_variant';
      const semData = await searchData(semanticQuery, customDbPath, {
        ...opts,
        limit: topK,
        minScore: opts.minScore ?? 0.2,
      });
      if (semData?.results) {
        rankedLists.push({
          source,
          query: semanticQuery,
          results: semData.results.map((result, idx) => ({
            key: `${result.name}:${result.file}:${result.line}`,
            rank: idx + 1,
            payload: { source, ...result },
          })),
        });
      }
    }
  }

  return rankedLists;
}

function weightsFromConfig(searchCfg: CodegraphConfig['search']): FusionWeights {
  return {
    bm25: searchCfg.rrfWeights?.bm25,
    bm25_variant: searchCfg.rrfWeights?.bm25Variant,
    vector: searchCfg.rrfWeights?.vector,
    vector_variant: searchCfg.rrfWeights?.vectorVariant,
    hyde: searchCfg.rrfWeights?.hyde,
  };
}

interface ResultMetrics {
  payload: RankedPayload | undefined;
  bm25Score: number | null;
  bm25Rank: number | null;
  similarity: number | null;
  semanticRank: number | null;
}

function metricsFromRankedLists(
  rankedLists: RankedFusionInput<RankedPayload>[],
): Map<string, ResultMetrics> {
  const metrics = new Map<string, ResultMetrics>();
  for (const list of rankedLists) {
    for (const result of list.results) {
      const current = metrics.get(result.key) ?? {
        payload: result.payload,
        bm25Score: null,
        bm25Rank: null,
        similarity: null,
        semanticRank: null,
      };
      if (current.payload === undefined) current.payload = result.payload;
      if (result.payload?.source === 'bm25' || result.payload?.source === 'bm25_variant') {
        if (current.bm25Rank === null || result.rank < current.bm25Rank) {
          current.bm25Rank = result.rank;
          current.bm25Score = result.payload.bm25Score ?? null;
        }
      } else if (current.semanticRank === null || result.rank < current.semanticRank) {
        current.semanticRank = result.rank;
        current.similarity = result.payload?.similarity ?? null;
      }
      metrics.set(result.key, current);
    }
  }
  return metrics;
}

function mapFusedResult(
  score: number,
  metrics: ResultMetrics | undefined,
  explain: FusionExplain,
  includeExplain: boolean,
): HybridResult {
  const payload = metrics?.payload;
  return {
    name: payload?.name ?? '',
    kind: payload?.kind ?? '',
    file: payload?.file ?? '',
    line: payload?.line ?? 0,
    endLine: payload?.endLine ?? null,
    role: payload?.role ?? null,
    fileHash: payload?.fileHash ?? null,
    rrf: score,
    bm25Score: metrics?.bm25Score ?? null,
    bm25Rank: metrics?.bm25Rank ?? null,
    similarity: metrics?.similarity ?? null,
    semanticRank: metrics?.semanticRank ?? null,
    ...(includeExplain ? { explain } : {}),
  };
}

/** Weighted Reciprocal Rank Fusion: merge ranked lists into a single scored result set. */
function fuseResults(
  rankedLists: RankedFusionInput<RankedPayload>[],
  config: CodegraphConfig['search'],
  limit: number,
  includeExplain: boolean,
): HybridResult[] {
  const fused = weightedRrfFuse(rankedLists, {
    k: config.rrfK,
    weights: weightsFromConfig(config),
    topRankBonus: config.topRankBonus ?? 0,
    topRankThreshold: config.topRankThreshold ?? 0,
    nearTopRankBonusMultiplier:
      config.nearTopRankBonusMultiplier ?? DEFAULTS.search.nearTopRankBonusMultiplier,
  });
  const metrics = metricsFromRankedLists(rankedLists);

  return fused
    .slice(0, limit)
    .map((result) =>
      mapFusedResult(result.score, metrics.get(result.key), result.explain, includeExplain),
    );
}

export async function hybridSearchData(
  query: string,
  customDbPath: string | undefined,
  opts: SemanticSearchOpts = {},
): Promise<HybridSearchResult | null> {
  const config = opts.config || loadConfig();
  const searchCfg = config.search || ({} as CodegraphConfig['search']);
  const limit = opts.limit ?? searchCfg.topK ?? 15;
  const topK = limit * 5;

  const checkDb = openReadonlyOrFail(customDbPath) as BetterSqlite3Database;
  const ftsAvailable = hasFtsIndex(checkDb);
  checkDb.close();
  if (!ftsAvailable) return null;

  const queries = parseQueries(query);
  const rankedLists = await collectRankedLists(queries, customDbPath, opts, topK);
  const results = fuseResults(
    rankedLists,
    { ...searchCfg, rrfK: opts.rrfK ?? searchCfg.rrfK },
    limit,
    opts.explain ?? false,
  );

  return { results };
}
