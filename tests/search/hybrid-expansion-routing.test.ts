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
  loadConfig: () => ({ search: { topK: 1, rrfK: 60 } }),
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

describe('hybrid expansion routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ftsSearchData.mockReturnValue({
      results: [
        {
          name: 'authenticate',
          kind: 'function',
          file: 'src/auth.ts',
          line: 1,
          endLine: null,
          role: null,
          fileHash: null,
          bm25Score: 0.01,
        },
      ],
    });
    mocks.searchData.mockResolvedValue({ results: [] });
  });

  test('default-off expansion does not run an extra BM25 strong-signal probe', async () => {
    await hybridSearchData('authenticate', 'codegraph.db', { limit: 1 });

    expect(mocks.ftsSearchData).toHaveBeenCalledTimes(1);
    expect(mocks.ftsSearchData).toHaveBeenCalledWith(
      'authenticate',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );
  });

  test('structured query modes bypass generation and route term separately from intent and hyde', async () => {
    const provider = { generate: vi.fn(async () => '{}') };

    await hybridSearchData('auth flow', 'codegraph.db', {
      limit: 1,
      expand: true,
      expansionProvider: provider,
      queryModes: [
        { mode: 'term', text: '"refresh token"' },
        { mode: 'intent', text: 'token rotation behavior' },
        { mode: 'hyde', text: 'Refresh tokens rotate on each use.' },
      ],
      queryTextKind: 'plain',
    });

    expect(provider.generate).not.toHaveBeenCalled();
    expect(mocks.ftsSearchData).toHaveBeenCalledWith(
      'auth flow',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );
    expect(mocks.ftsSearchData).toHaveBeenCalledWith(
      '"refresh token"',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );
    expect(mocks.searchData).toHaveBeenCalledWith(
      'auth flow',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );
    expect(mocks.searchData).toHaveBeenCalledWith(
      'token rotation behavior',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );
    expect(mocks.searchData).toHaveBeenCalledWith(
      'Refresh tokens rotate on each use.',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );
  });

  test('derived intent query is not routed to BM25 and derived term query is not routed semantically', async () => {
    await hybridSearchData('token rotation behavior', 'codegraph.db', {
      limit: 1,
      queryModes: [{ mode: 'intent', text: 'token rotation behavior' }],
      queryTextKind: 'intent',
    });

    expect(mocks.ftsSearchData).not.toHaveBeenCalled();
    expect(mocks.searchData).toHaveBeenCalledWith(
      'token rotation behavior',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );

    vi.clearAllMocks();

    await hybridSearchData('"refresh token"', 'codegraph.db', {
      limit: 1,
      queryModes: [{ mode: 'term', text: '"refresh token"' }],
      queryTextKind: 'term',
    });

    expect(mocks.ftsSearchData).toHaveBeenCalledWith(
      '"refresh token"',
      'codegraph.db',
      expect.objectContaining({ limit: 5 }),
    );
    expect(mocks.searchData).not.toHaveBeenCalled();
  });
});
