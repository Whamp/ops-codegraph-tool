import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ftsSearchData: vi.fn(),
  searchData: vi.fn(),
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

const bm25Result = (name: string, bm25Score = 1) => ({
  name,
  kind: 'function',
  file: `src/${name}.ts`,
  line: 1,
  endLine: null,
  role: null,
  fileHash: null,
  bm25Score,
});

const vectorResult = (name: string, similarity = 0.9) => ({
  name,
  kind: 'function',
  file: `src/${name}.ts`,
  line: 1,
  endLine: null,
  role: null,
  fileHash: null,
  similarity,
});

describe('hybrid search with reranking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
