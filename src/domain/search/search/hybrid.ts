import { openReadonlyOrFail } from '../../../db/index.js';
import { DEFAULTS, loadConfig } from '../../../infrastructure/config.js';
import type { BetterSqlite3Database, CodegraphConfig } from '../../../types.js';
import { resolveModelRoleUri } from '../models.js';
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
import {
  createDefaultRerankPort,
  type RerankCandidate,
  type RerankExplain,
  type RerankPort,
  rerankCandidates,
} from './rerank.js';
import type { SemanticSearchOpts } from './semantic.js';
import { searchData } from './semantic.js';

interface RerankResultMeta {
  rerankScore: number | null;
  blendedScore: number;
  rerankExplain?: RerankExplain;
}

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
  /** Rerank metadata — present only when reranking was applied */
  rerank?: RerankResultMeta;
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
  content?: string;
  text_preview?: string;
  textPreview?: string;
  full_text?: string;
  fullText?: string;
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
  rerankMeta?: RerankResultMeta,
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
    ...(rerankMeta ? { rerank: rerankMeta } : {}),
  };
}

/** Apply cross-encoder reranking to fused results if a rerank port is available. */
function bestRerankText(payload: RankedPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const candidates = [
    payload.full_text,
    payload.fullText,
    payload.text_preview,
    payload.textPreview,
    payload.content,
  ];
  return candidates.find((text) => typeof text === 'string' && text.trim().length > 0);
}

function isOriginalPlainBm25TopHit(
  fusedResult: { bm25Rank?: number | null; payload?: RankedPayload; explain: FusionExplain },
  query: string,
  opts: SemanticSearchOpts,
): boolean {
  const queryTextKind = opts.queryTextKind ?? 'plain';
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedName = fusedResult.payload?.name.trim().toLowerCase();
  return (
    queryTextKind === 'plain' &&
    normalizedQuery.length > 0 &&
    normalizedQuery === normalizedName &&
    fusedResult.bm25Rank === 1 &&
    fusedResult.explain.sources.some(
      (source) => source.source === 'bm25' && source.rank === 1 && source.query === query,
    )
  );
}

function bestRerankTextByKey(rankedLists: RankedFusionInput<RankedPayload>[]): Map<string, string> {
  const textByKey = new Map<string, string>();
  for (const field of [
    'full_text',
    'fullText',
    'text_preview',
    'textPreview',
    'content',
  ] as const) {
    for (const list of rankedLists) {
      for (const result of list.results) {
        if (textByKey.has(result.key)) continue;
        const text = result.payload?.[field];
        if (typeof text === 'string' && text.trim().length > 0) {
          textByKey.set(result.key, text);
        }
      }
    }
  }
  return textByKey;
}

interface AppliedReranking {
  metaByKey: Map<string, RerankResultMeta>;
  orderedKeys: string[] | null;
}

async function applyReranking(
  fusedResults: Array<{
    key: string;
    score: number;
    bm25Rank?: number | null;
    payload?: RankedPayload;
    explain: FusionExplain;
  }>,
  query: string,
  rerankPort: RerankPort | null | undefined,
  searchCfg: CodegraphConfig['search'],
  opts: SemanticSearchOpts,
  textByKey: Map<string, string>,
): Promise<AppliedReranking> {
  const rerankMetaBykey = new Map<string, RerankResultMeta>();

  const rerankEnabled = searchCfg.rerank?.enabled ?? false;
  if (!rerankPort || !rerankEnabled) return { metaByKey: rerankMetaBykey, orderedKeys: null };

  const maxCandidates =
    searchCfg.rerank?.maxCandidates ?? DEFAULTS.search.rerank?.maxCandidates ?? 20;
  const fusionWeight =
    searchCfg.rerank?.fusionWeight ?? DEFAULTS.search.rerank?.fusionWeight ?? 0.4;
  const rerankWeight =
    searchCfg.rerank?.rerankWeight ?? DEFAULTS.search.rerank?.rerankWeight ?? 0.6;

  const candidates: RerankCandidate[] = fusedResults.map((r) => ({
    key: r.key,
    name: (r.payload as RankedPayload | undefined)?.name ?? '',
    kind: (r.payload as RankedPayload | undefined)?.kind ?? '',
    file: (r.payload as RankedPayload | undefined)?.file ?? '',
    line: (r.payload as RankedPayload | undefined)?.line ?? 0,
    fusionScore: r.score,
    bm25Rank: r.bm25Rank ?? null,
    lexicalExactTopHit: isOriginalPlainBm25TopHit(r, query, opts),
    text: textByKey.get(r.key) ?? bestRerankText(r.payload),
  }));

  // Build intent from query modes if available
  const intentParts: string[] = [];
  if (opts.queryModes) {
    for (const qm of opts.queryModes) {
      if (qm.mode === 'intent' && qm.text) {
        intentParts.push(qm.text);
      }
    }
  }
  const intent = intentParts.length > 0 ? intentParts.join('; ') : undefined;

  const rerankOutput = await rerankCandidates(rerankPort, query, candidates, {
    maxCandidates,
    fusionWeight,
    rerankWeight,
    intent,
  });

  for (const candidate of rerankOutput.candidates) {
    rerankMetaBykey.set(candidate.key, {
      rerankScore: candidate.rerankScore,
      blendedScore: candidate.blendedScore,
      rerankExplain: candidate.explain,
    });
  }

  return {
    metaByKey: rerankMetaBykey,
    orderedKeys: rerankOutput.reranked
      ? rerankOutput.candidates.map((candidate) => candidate.key)
      : null,
  };
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
  const textByKey = bestRerankTextByKey(rankedLists);
  const fused = weightedRrfFuse(rankedLists, {
    k: opts.rrfK ?? searchCfg.rrfK,
    weights: weightsFromConfig(searchCfg),
    topRankBonus: searchCfg.topRankBonus ?? 0,
    topRankThreshold: searchCfg.topRankThreshold ?? 0,
    nearTopRankBonusMultiplier:
      searchCfg.nearTopRankBonusMultiplier ?? DEFAULTS.search.nearTopRankBonusMultiplier,
  });

  // Apply reranking when config enables it, using an injected port or safe default HTTP port.
  let rerankPort = (opts as SemanticSearchOpts & { rerankPort?: RerankPort }).rerankPort;
  let rerankMetaBykey = new Map<string, RerankResultMeta>();
  let orderedRerankKeys: string[] | null = null;
  if (searchCfg.rerank?.enabled ?? false) {
    if (!rerankPort) {
      rerankPort = createDefaultRerankPort(resolveModelRoleUri(config, 'rerank')) ?? undefined;
    }
    if (rerankPort) {
      const applied = await applyReranking(fused, query, rerankPort, searchCfg, opts, textByKey);
      rerankMetaBykey = applied.metaByKey;
      orderedRerankKeys = applied.orderedKeys;
    }
  }

  const metrics = metricsFromRankedLists(rankedLists);
  const fusedByKey = new Map(fused.map((result) => [result.key, result]));
  const orderedFused = orderedRerankKeys
    ? [
        ...orderedRerankKeys.flatMap((key) => {
          const result = fusedByKey.get(key);
          return result ? [result] : [];
        }),
        ...fused.filter((result) => !orderedRerankKeys.includes(result.key)),
      ]
    : fused;
  const results = orderedFused
    .slice(0, limit)
    .map((result) =>
      mapFusedResult(
        result.score,
        metrics.get(result.key),
        result.explain,
        opts.explain ?? false,
        rerankMetaBykey.get(result.key),
      ),
    );

  return { results };
}
