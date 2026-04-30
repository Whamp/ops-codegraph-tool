import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ftsSearchData: vi.fn(),
  searchData: vi.fn(),
}));

vi.mock('../../src/db/index.js', () => ({
  openReadonlyOrFail: () => ({ close: vi.fn() }),
}));

vi.mock('../../src/infrastructure/config.js', () => ({
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
});
