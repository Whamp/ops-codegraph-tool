import { beforeEach, describe, expect, it, vi } from 'vitest';

const hybridSearchData = vi.fn();
const searchData = vi.fn();
const ftsSearchData = vi.fn();

vi.mock('../../src/domain/search/index.js', () => ({
  hybridSearchData,
  searchData,
  ftsSearchData,
}));

const ctx = {
  dbPath: '/tmp/codegraph.db',
  MCP_MAX_LIMIT: 50,
} as any;

describe('MCP semantic_search pipeline parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to hybrid retrieval with expansion, reranking controls, and explain metadata', async () => {
    hybridSearchData.mockResolvedValue({ results: [{ name: 'auth', explain: { sources: [] } }] });
    const { handler } = await import('../../src/mcp/tools/semantic-search.js');

    const result = await handler(
      {
        query: 'auth flow',
        limit: 10,
        explain: true,
        rerank_candidates: 7,
      },
      ctx,
    );

    expect(result).toEqual({ results: [{ name: 'auth', explain: { sources: [] } }] });
    expect(hybridSearchData).toHaveBeenCalledWith('auth flow', '/tmp/codegraph.db', {
      limit: 10,
      offset: 0,
      minScore: undefined,
      expand: true,
      explain: true,
      rerank: undefined,
      rerankCandidates: 7,
      queryModes: [],
      queryTextKind: 'plain',
      rrfK: undefined,
    });
  });

  it('keeps MCP controls additive and supports disabling expansion and reranking', async () => {
    hybridSearchData.mockResolvedValue({ results: [] });
    const { handler } = await import('../../src/mcp/tools/semantic-search.js');

    await handler(
      {
        query: 'intent: token rotation',
        no_expand: true,
        no_rerank: true,
        rrf_k: 30,
        query_mode: ['term:"refresh token"'],
      },
      ctx,
    );

    expect(hybridSearchData).toHaveBeenCalledWith('token rotation', '/tmp/codegraph.db', {
      limit: 20,
      offset: 0,
      minScore: undefined,
      expand: false,
      explain: undefined,
      rerank: false,
      rerankCandidates: undefined,
      queryModes: [
        { mode: 'intent', text: 'token rotation' },
        { mode: 'term', text: '"refresh token"' },
      ],
      queryTextKind: 'intent',
      rrfK: 30,
    });
  });

  it('falls back from hybrid to semantic with metadata when FTS is unavailable', async () => {
    hybridSearchData.mockResolvedValue(null);
    searchData.mockResolvedValue({ results: [{ name: 'semanticHit', similarity: 0.9 }] });
    const { handler } = await import('../../src/mcp/tools/semantic-search.js');

    const result = await handler({ query: 'auth' }, ctx);

    expect(result).toEqual({
      results: [{ name: 'semanticHit', similarity: 0.9 }],
      fallback: {
        mode: 'semantic',
        reason: 'FTS5 hybrid index unavailable',
        message: expect.stringContaining('returned semantic-only results'),
      },
    });
    expect(searchData).toHaveBeenCalledWith('auth', '/tmp/codegraph.db', expect.any(Object));
  });

  it('falls back to keyword with actionable content when semantic embedding is unavailable', async () => {
    hybridSearchData.mockRejectedValue(new Error('Embedding model unavailable'));
    ftsSearchData.mockReturnValue({ results: [{ name: 'keywordHit', bm25Score: -1.2 }] });
    const { handler } = await import('../../src/mcp/tools/semantic-search.js');

    const result = await handler({ query: 'auth' }, ctx);

    expect(result).toEqual({
      results: [{ name: 'keywordHit', bm25Score: -1.2 }],
      fallback: {
        mode: 'keyword',
        reason: 'Embedding model unavailable',
        message: expect.stringContaining('Hybrid semantic retrieval unavailable'),
      },
    });
  });

  it('returns structured actionable errors when all retrieval paths are unavailable', async () => {
    hybridSearchData.mockRejectedValue(new Error('vector search unavailable'));
    ftsSearchData.mockReturnValue(null);
    searchData.mockResolvedValue(null);
    const { handler } = await import('../../src/mcp/tools/semantic-search.js');

    const result = await handler({ query: 'auth' }, ctx);

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text: expect.stringContaining('Semantic search unavailable'),
        },
      ],
    });
    expect((result as any).content[0].text).toContain('codegraph embed');
  });
});
