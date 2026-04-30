import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ftsSearchData: vi.fn(),
  searchData: vi.fn(),
}));

vi.mock('../../src/db/index.js', () => ({
  openReadonlyOrFail: () => ({ close: vi.fn() }),
}));

vi.mock('../../src/infrastructure/config.js', () => ({
  DEFAULTS: { search: { nearTopRankBonusMultiplier: 0.4 } },
  loadConfig: () => ({
    search: {
      topK: 2,
      rrfK: 60,
      rrfWeights: { bm25: 2, bm25Variant: 0.5, vector: 2, vectorVariant: 0.5, hyde: 0.7 },
      topRankBonus: 0,
      topRankThreshold: 3,
      nearTopRankBonusMultiplier: 0.4,
    },
  }),
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

describe('hybrid weighted RRF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('fuses expanded BM25/vector sources with explainable source metadata', async () => {
    const provider = {
      generate: vi.fn(async () =>
        JSON.stringify({
          lexicalQueries: ['auth token'],
          vectorQueries: ['authentication token flow'],
          hyde: 'Authentication token flow code validates and rotates credentials.',
        }),
      ),
    };
    mocks.ftsSearchData
      .mockReturnValueOnce({ results: [] })
      .mockReturnValueOnce({ results: [bm25Result('original')] })
      .mockReturnValueOnce({ results: [bm25Result('variant')] });
    mocks.searchData
      .mockResolvedValueOnce({ results: [vectorResult('semantic')] })
      .mockResolvedValueOnce({ results: [vectorResult('variant')] })
      .mockResolvedValueOnce({ results: [vectorResult('hyde')] });

    const data = await hybridSearchData('auth token flow', 'codegraph.db', {
      limit: 5,
      expand: true,
      expansionProvider: provider,
      explain: true,
    });

    expect(data?.results.map((result) => result.name)).toEqual([
      'original',
      'semantic',
      'variant',
      'hyde',
    ]);
    expect(data?.results[0]?.explain?.sources[0]).toMatchObject({
      source: 'bm25',
      stage: 'bm25',
      rank: 1,
      weight: 2,
    });
    expect(
      data?.results.find((result) => result.name === 'hyde')?.explain?.sources[0],
    ).toMatchObject({
      source: 'hyde',
      stage: 'vector',
      weight: 0.7,
    });
  });
});
