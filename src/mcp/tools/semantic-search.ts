import { effectiveOffset, MCP_DEFAULTS } from '../middleware.js';
import type { McpToolContext } from '../server.js';

export const name = 'semantic_search';

type QueryModeArg = string | { mode?: string; text?: string };

interface SemanticSearchArgs {
  query: string;
  mode?: string;
  limit?: number;
  offset?: number;
  min_score?: number;
  expand?: boolean;
  no_expand?: boolean;
  rerank?: boolean;
  no_rerank?: boolean;
  rerank_candidates?: number;
  rrf_k?: number;
  query_mode?: string | string[];
  query_modes?: QueryModeArg[];
  explain?: boolean;
}

function errorResult(text: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return { content: [{ type: 'text', text }], isError: true };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeQueryModeArgs(args: SemanticSearchArgs): string[] {
  const specs: string[] = [];
  const addSpec = (spec: unknown) => {
    if (typeof spec === 'string' && spec.trim().length > 0) specs.push(spec);
  };

  if (Array.isArray(args.query_mode)) {
    for (const spec of args.query_mode) addSpec(spec);
  } else {
    addSpec(args.query_mode);
  }

  for (const entry of args.query_modes ?? []) {
    if (typeof entry === 'string') {
      addSpec(entry);
    } else if (entry && typeof entry.mode === 'string' && typeof entry.text === 'string') {
      addSpec(`${entry.mode}:${entry.text}`);
    }
  }
  return specs;
}

async function buildSearchInput(args: SemanticSearchArgs): Promise<{
  query: string;
  queryModes: Array<{ mode: 'term' | 'intent' | 'hyde'; text: string }>;
  queryTextKind: 'plain' | 'term' | 'intent' | 'empty';
}> {
  const { normalizeStructuredQueryInput, parseQueryModeSpecs } = await import(
    '../../domain/search/search/expansion.js'
  );
  const explicitModes = parseQueryModeSpecs(normalizeQueryModeArgs(args));
  const normalized = normalizeStructuredQueryInput(args.query, explicitModes);
  return {
    query: normalized.query,
    queryModes: normalized.queryModes,
    queryTextKind: normalized.queryTextKind,
  };
}

function buildSearchOpts(
  args: SemanticSearchArgs,
  ctx: McpToolContext,
  queryModes: Array<{ mode: 'term' | 'intent' | 'hyde'; text: string }>,
  queryTextKind: 'plain' | 'term' | 'intent' | 'empty',
) {
  const hasStructuredModes = queryModes.length > 0;
  const expand = hasStructuredModes ? false : args.no_expand ? false : (args.expand ?? true);
  const rerank = args.no_rerank ? false : args.rerank;
  return {
    limit: Math.min(args.limit ?? MCP_DEFAULTS.semantic_search ?? 100, ctx.MCP_MAX_LIMIT),
    offset: effectiveOffset(args),
    minScore: args.min_score,
    expand,
    explain: args.explain,
    rerank,
    rerankCandidates: args.rerank_candidates,
    queryModes,
    queryTextKind,
    rrfK: args.rrf_k,
  };
}

export async function handler(args: SemanticSearchArgs, ctx: McpToolContext): Promise<unknown> {
  let input: Awaited<ReturnType<typeof buildSearchInput>>;
  try {
    input = await buildSearchInput(args);
  } catch (error) {
    return errorResult(`Invalid semantic_search query_mode input: ${errorMessage(error)}`);
  }

  const mode = args.mode || 'hybrid';
  if (!['hybrid', 'semantic', 'keyword'].includes(mode)) {
    return errorResult(
      `Invalid semantic_search mode "${mode}". Use "hybrid", "semantic", or "keyword".`,
    );
  }
  const searchOpts = buildSearchOpts(args, ctx, input.queryModes, input.queryTextKind);

  if (mode === 'keyword') {
    const { ftsSearchData } = await import('../../domain/search/index.js');
    const result = ftsSearchData(input.query, ctx.dbPath, searchOpts);
    if (result === null) {
      return errorResult(
        'Keyword search unavailable: no FTS5 index found. Run `codegraph embed` to build the keyword index.',
      );
    }
    return result;
  }

  if (mode === 'semantic') {
    const { searchData } = await import('../../domain/search/index.js');
    try {
      const result = await searchData(input.query, ctx.dbPath, searchOpts);
      if (result === null) {
        return errorResult(
          'Semantic search unavailable: no embeddings found or vector search could not run. Run `codegraph embed` first, or use mode="keyword" if an FTS index is available.',
        );
      }
      return result;
    } catch (error) {
      return errorResult(
        `Semantic search unavailable: ${errorMessage(error)}. Run \`codegraph embed\` to rebuild embeddings, check embedding model/runtime configuration, or use mode="keyword".`,
      );
    }
  }

  // hybrid (default) — new retrieval pipeline with graceful fallbacks for MCP agents.
  const { ftsSearchData, hybridSearchData, searchData } = await import(
    '../../domain/search/index.js'
  );
  try {
    const result: unknown = await hybridSearchData(input.query, ctx.dbPath, searchOpts);
    if (result !== null) return result;
  } catch (error) {
    const keyword = ftsSearchData(input.query, ctx.dbPath, searchOpts);
    if (keyword !== null) {
      return {
        ...keyword,
        fallback: {
          mode: 'keyword',
          reason: errorMessage(error),
          message:
            'Hybrid semantic retrieval unavailable; returned BM25 keyword results. Re-run `codegraph embed` and check embedding/vector/rerank model configuration to restore hybrid search.',
        },
      };
    }
    const semantic = await searchData(input.query, ctx.dbPath, searchOpts).catch(() => null);
    if (semantic !== null) {
      return {
        ...semantic,
        fallback: {
          mode: 'semantic',
          reason: errorMessage(error),
          message:
            'Hybrid retrieval unavailable because keyword/vector fusion failed; returned semantic-only results.',
        },
      };
    }
    return errorResult(
      `Semantic search unavailable: ${errorMessage(error)}. No keyword fallback is available. Run \`codegraph embed\` to build embeddings and the FTS5 keyword index, then retry.`,
    );
  }

  const semantic = await searchData(input.query, ctx.dbPath, searchOpts).catch(() => null);
  if (semantic !== null) return semantic;

  const keyword = ftsSearchData(input.query, ctx.dbPath, searchOpts);
  if (keyword !== null) {
    return {
      ...keyword,
      fallback: {
        mode: 'keyword',
        reason: 'FTS5 hybrid index unavailable and semantic embeddings unavailable',
        message:
          'Hybrid search unavailable; returned BM25 keyword results. Run `codegraph embed` to rebuild embeddings and the FTS5 index for hybrid search.',
      },
    };
  }

  return errorResult(
    'Semantic search unavailable: no embeddings or FTS5 keyword index found. Run `codegraph embed` first, then retry.',
  );
}
