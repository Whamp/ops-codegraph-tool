import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ftsSearchData: vi.fn(),
  searchData: vi.fn(),
  resolveModelRoleUri: vi.fn(),
}));

vi.mock('../../src/db/index.js', () => ({
  openReadonlyOrFail: () => ({ close: vi.fn() }),
}));

const mockConfig = {
  search: {
    topK: 5,
    rrfK: 60,
    rrfWeights: { bm25: 2, bm25Variant: 0.5, vector: 2, vectorVariant: 0.5, hyde: 0.7 },
    topRankBonus: 0,
    topRankThreshold: 3,
    nearTopRankBonusMultiplier: 0.4,
    rerank: {
      enabled: true,
      maxCandidates: 10,
      fusionWeight: 0.4,
      rerankWeight: 0.6,
    },
  },
};

vi.mock('../../src/infrastructure/config.js', () => ({
  DEFAULTS: {
    search: {
      nearTopRankBonusMultiplier: 0.4,
      rerank: { enabled: false, maxCandidates: 20, fusionWeight: 0.4, rerankWeight: 0.6 },
    },
  },
  loadConfig: () => mockConfig,
}));

vi.mock('../../src/domain/search/models.js', () => ({
  resolveModelRoleUri: mocks.resolveModelRoleUri,
}));

vi.mock('../../src/domain/search/stores/fts5.js', () => ({
  hasFtsIndex: () => true,
}));

vi.mock('../../src/domain/search/search/keyword.js', () => ({
  ftsSearchData: mocks.ftsSearchData,
}));

vi.mock('../../src/domain/search/search/semantic.js', () => ({
  searchData: mocks.searchData,
}));

import type { RerankPort } from '../../src/domain/search/search/rerank.js';

const { hybridSearchData } = await import('../../src/domain/search/search/hybrid.js');

const bm25Result = (name: string, bm25Score = 1, extra: Record<string, unknown> = {}) => ({
  name,
  kind: 'function',
  file: `src/${name}.ts`,
  line: 1,
  endLine: null,
  role: null,
  fileHash: null,
  bm25Score,
  ...extra,
});

const vectorResult = (name: string, similarity = 0.9, extra: Record<string, unknown> = {}) => ({
  name,
  kind: 'function',
  file: `src/${name}.ts`,
  line: 1,
  endLine: null,
  role: null,
  fileHash: null,
  similarity,
  ...extra,
});

describe('hybrid search with reranking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveModelRoleUri.mockReturnValue('local:unsupported-reranker');
  });

  test('skips reranking when rerankPort is not provided', async () => {
    mocks.ftsSearchData.mockReturnValue({ results: [bm25Result('alpha')] });
    mocks.searchData.mockResolvedValue({ results: [vectorResult('beta')] });

    const data = await hybridSearchData('test query', 'codegraph.db', {
      config: mockConfig as any,
      explain: true,
    });

    expect(data?.results).toBeDefined();
    // No rerank metadata should be present
    for (const r of data?.results ?? []) {
      expect(r.rerank).toBeUndefined();
    }
  });

  test('skips reranking when rerank is disabled in config', async () => {
    mocks.ftsSearchData.mockReturnValue({ results: [bm25Result('alpha')] });
    mocks.searchData.mockResolvedValue({ results: [vectorResult('beta')] });

    const disabledConfig = {
      ...mockConfig,
      search: { ...mockConfig.search, rerank: { ...mockConfig.search.rerank, enabled: false } },
    };

    const mockPort: RerankPort = {
      async rerank() {
        throw new Error('should not be called');
      },
    };

    const data = await hybridSearchData('test query', 'codegraph.db', {
      config: disabledConfig as any,
      rerankPort: mockPort,
      explain: true,
    });

    expect(data?.results).toBeDefined();
    for (const r of data?.results ?? []) {
      expect(r.rerank).toBeUndefined();
    }
  });

  test('applies reranking when port is provided and config enabled', async () => {
    mocks.ftsSearchData.mockReturnValue({ results: [bm25Result('alpha')] });
    mocks.searchData.mockResolvedValue({ results: [vectorResult('beta')] });

    const mockPort: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: 0.5 })),
        };
      },
    };

    const data = await hybridSearchData('test query', 'codegraph.db', {
      config: mockConfig as any,
      rerankPort: mockPort,
      explain: true,
    });

    expect(data?.results).toBeDefined();
    // At least some results should have rerank metadata
    const withRerank = data?.results.filter((r) => r.rerank !== undefined) ?? [];
    expect(withRerank.length).toBeGreaterThan(0);
    for (const r of withRerank) {
      expect(r.rerank?.rerankScore).not.toBeNull();
      expect(r.rerank?.blendedScore).toBeGreaterThanOrEqual(0);
    }
  });

  test('uses successful rerank output to drive final result ordering', async () => {
    mocks.ftsSearchData.mockReturnValue({ results: [bm25Result('alpha'), bm25Result('beta')] });
    mocks.searchData.mockResolvedValue({ results: [] });

    const mockPort: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: i === 0 ? 0.1 : 0.99 })),
        };
      },
    };

    const data = await hybridSearchData('test query', 'codegraph.db', {
      config: {
        ...mockConfig,
        search: {
          ...mockConfig.search,
          rerank: { ...mockConfig.search.rerank, rerankWeight: 1, fusionWeight: 0 },
        },
      } as any,
      rerankPort: mockPort,
      explain: true,
    });

    expect(data?.results.map((r) => r.name)).toEqual(['beta', 'alpha']);
    expect(data?.results[0]?.bm25Rank).toBe(2);
    expect(data?.results[0]?.rrf).toBeGreaterThan(0);
  });

  test('creates an HTTP rerank port from configured rerank model role when no port is injected', async () => {
    mocks.ftsSearchData.mockReturnValue({ results: [bm25Result('alpha'), bm25Result('beta')] });
    mocks.searchData.mockResolvedValue({ results: [] });
    mocks.resolveModelRoleUri.mockReturnValue('https://reranker.example.test/rerank');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { index: 0, score: 0.2 },
            { index: 1, score: 0.9 },
          ]),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await hybridSearchData('test query', 'codegraph.db', {
      config: {
        ...mockConfig,
        search: {
          ...mockConfig.search,
          rerank: { ...mockConfig.search.rerank, rerankWeight: 1, fusionWeight: 0 },
        },
      } as any,
      explain: true,
    });

    expect(mocks.resolveModelRoleUri).toHaveBeenCalledWith(expect.any(Object), 'rerank');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://reranker.example.test/rerank',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(data?.results.map((r) => r.name)).toEqual(['beta', 'alpha']);

    vi.unstubAllGlobals();
  });

  test('protects the original plain BM25 top hit from rerank demotion at hybrid level', async () => {
    mocks.ftsSearchData.mockReturnValue({ results: [bm25Result('alpha'), bm25Result('beta')] });
    mocks.searchData.mockResolvedValue({ results: [] });

    const mockPort: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: i === 0 ? 0.1 : 0.99 })),
        };
      },
    };

    const data = await hybridSearchData('alpha', 'codegraph.db', {
      config: {
        ...mockConfig,
        search: {
          ...mockConfig.search,
          rerank: { ...mockConfig.search.rerank, rerankWeight: 1, fusionWeight: 0 },
        },
      } as any,
      rerankPort: mockPort,
      explain: true,
    });

    expect(data?.results.map((r) => r.name)).toEqual(['alpha', 'beta']);
    expect(data?.results[0]?.rerank?.rerankExplain?.protectedLexicalHit).toBe(true);
  });

  test('passes best available symbol text to rerank port', async () => {
    mocks.ftsSearchData.mockReturnValue({
      results: [
        bm25Result('alpha', 1, { content: 'fts content alpha' }),
        bm25Result('beta', 0.9, { text_preview: 'preview beta' }),
        bm25Result('gamma', 0.8),
      ],
    });
    mocks.searchData.mockResolvedValue({
      results: [vectorResult('alpha', 0.9, { full_text: 'full text alpha' })],
    });
    let capturedDocuments: string[] = [];
    const mockPort: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        capturedDocuments = documents;
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: 1 - i / 10 })),
        };
      },
    };

    await hybridSearchData('test query', 'codegraph.db', {
      config: mockConfig as any,
      rerankPort: mockPort,
      explain: true,
    });

    expect(capturedDocuments).toContain('full text alpha');
    expect(capturedDocuments).toContain('preview beta');
    expect(capturedDocuments).toContain('gamma (function) — src/gamma.ts:1');
  });

  test('gracefully handles rerank port failure', async () => {
    mocks.ftsSearchData.mockReturnValue({ results: [bm25Result('alpha')] });
    mocks.searchData.mockResolvedValue({ results: [vectorResult('beta')] });

    const failingPort: RerankPort = {
      async rerank() {
        return { ok: false as const, error: new Error('model crashed') };
      },
    };

    const data = await hybridSearchData('test query', 'codegraph.db', {
      config: mockConfig as any,
      rerankPort: failingPort,
      explain: true,
    });

    // Should still return fusion results (fallback)
    expect(data?.results).toBeDefined();
    expect(data!.results.length).toBeGreaterThan(0);
    expect(data!.results[0]?.rerank?.rerankExplain?.fallbackCode).toBe('port_error');
    expect(data!.results[0]?.rerank?.rerankExplain?.fallbackMessage).toBe('model crashed');
  });
});
