import { describe, expect, test, vi } from 'vitest';
import {
  buildExpansionFromQueryModes,
  normalizeStructuredQueryInput,
  parseQueryModeSpec,
  parseQueryModeSpecs,
  routeExpandedQueries,
  validateQueryModes,
} from '../../src/domain/search/search/expansion.js';

describe('structured query mode parsing and normalization', () => {
  test('parses explicit term intent and hyde query-mode specs', () => {
    expect(parseQueryModeSpec('term:"refresh token"')).toEqual({
      mode: 'term',
      text: '"refresh token"',
    });
    expect(parseQueryModeSpec(' intent: token rotation ')).toEqual({
      mode: 'intent',
      text: 'token rotation',
    });
    expect(parseQueryModeSpec('hyde: Tokens rotate on use.')).toEqual({
      mode: 'hyde',
      text: 'Tokens rotate on use.',
    });
  });

  test('rejects invalid explicit query-mode specs with actionable errors', () => {
    expect(() => parseQueryModeSpec('vector: token rotation')).toThrow(
      /Expected "term:<text>", "intent:<text>", or "hyde:<text>"/,
    );
    expect(() => parseQueryModeSpec('term:   ')).toThrow(/non-empty text after term:/);
    expect(() => parseQueryModeSpecs(['hyde: one', 'hyde: two'])).toThrow(/Only one hyde/i);
  });

  test('normalizes multi-line structured query syntax and preserves plain vs derived base query source', () => {
    expect(
      normalizeStructuredQueryInput('auth flow\nterm: "refresh token"\nintent: token rotation'),
    ).toEqual({
      query: 'auth flow',
      queryModes: [
        { mode: 'term', text: '"refresh token"' },
        { mode: 'intent', text: 'token rotation' },
      ],
      usedStructuredQuerySyntax: true,
      derivedQuery: false,
      queryTextKind: 'plain',
    });

    expect(normalizeStructuredQueryInput('term: "refresh token"\nintent: token rotation')).toEqual({
      query: '"refresh token"',
      queryModes: [
        { mode: 'term', text: '"refresh token"' },
        { mode: 'intent', text: 'token rotation' },
      ],
      usedStructuredQuerySyntax: true,
      derivedQuery: true,
      queryTextKind: 'term',
    });

    expect(normalizeStructuredQueryInput('intent: token rotation')).toEqual({
      query: 'token rotation',
      queryModes: [{ mode: 'intent', text: 'token rotation' }],
      usedStructuredQuerySyntax: true,
      derivedQuery: true,
      queryTextKind: 'intent',
    });
  });

  test('leaves plain single-line and untyped multi-line queries unchanged', () => {
    expect(normalizeStructuredQueryInput('auth flow')).toMatchObject({
      query: 'auth flow',
      queryModes: [],
      usedStructuredQuerySyntax: false,
    });
    expect(normalizeStructuredQueryInput('auth flow\nfind token code')).toMatchObject({
      query: 'auth flow\nfind token code',
      queryModes: [],
      usedStructuredQuerySyntax: false,
    });
  });

  test('rejects bad structured query documents', () => {
    expect(() => normalizeStructuredQueryInput('auth\nvector: token rotation')).toThrow(
      /Unknown structured query line prefix "vector:".*Expected term:, intent:, or hyde:/,
    );
    expect(() => normalizeStructuredQueryInput('auth\nterm:   ')).toThrow(
      /line 2 must contain non-empty text after term:/,
    );
    expect(() => normalizeStructuredQueryInput('auth\nhyde: one\nhyde: two')).toThrow(
      /Only one hyde line/,
    );
    expect(() => normalizeStructuredQueryInput('hyde: hypothetical answer\n')).toThrow(
      /hyde-only documents are not allowed/,
    );
  });
});

describe('structured query mode routing', () => {
  test('builds expansion shape with term only as BM25 and intent or hyde only as semantic', () => {
    expect(
      buildExpansionFromQueryModes([
        { mode: 'term', text: '"refresh token"' },
        { mode: 'intent', text: 'token rotation behavior' },
        { mode: 'hyde', text: 'Refresh tokens rotate on each use.' },
      ]),
    ).toEqual({
      lexicalQueries: ['"refresh token"'],
      vectorQueries: ['token rotation behavior'],
      hyde: 'Refresh tokens rotate on each use.',
    });
  });

  test('rejects hyde-only query modes during validation', () => {
    expect(() => validateQueryModes([{ mode: 'hyde', text: 'hypothetical answer' }])).toThrow(
      /hyde-only inputs are not allowed/i,
    );
  });

  test('allows hyde when a plain base query is present', async () => {
    const normalized = normalizeStructuredQueryInput('auth flow\nhyde: Tokens rotate on use.');
    expect(normalized.query).toBe('auth flow');
    expect(normalized.queryModes).toEqual([{ mode: 'hyde', text: 'Tokens rotate on use.' }]);

    const routed = await routeExpandedQueries(
      'auth flow',
      { queryModes: normalized.queryModes, queryTextKind: normalized.queryTextKind },
      [],
    );
    expect(routed.bm25Queries).toEqual(['auth flow']);
    expect(routed.semanticQueries).toEqual(['auth flow', 'Tokens rotate on use.']);
  });

  test('routes intent-only structured documents only to semantic search', async () => {
    const normalized = normalizeStructuredQueryInput('intent: token rotation behavior');
    const routed = await routeExpandedQueries(
      normalized.query,
      { queryModes: normalized.queryModes, queryTextKind: normalized.queryTextKind },
      [],
    );

    expect(routed.bm25Queries).toEqual([]);
    expect(routed.semanticQueries).toEqual(['token rotation behavior']);
  });

  test('routes term-only structured documents only to BM25 search', async () => {
    const normalized = normalizeStructuredQueryInput('term: "refresh token"');
    const routed = await routeExpandedQueries(
      normalized.query,
      { queryModes: normalized.queryModes, queryTextKind: normalized.queryTextKind },
      [],
    );

    expect(routed.bm25Queries).toEqual(['"refresh token"']);
    expect(routed.semanticQueries).toEqual([]);
  });

  test('routes mixed plain term intent documents to both only for plain text', async () => {
    const normalized = normalizeStructuredQueryInput(
      'auth flow\nterm: "refresh token"\nintent: token rotation behavior',
    );
    const routed = await routeExpandedQueries(
      normalized.query,
      { queryModes: normalized.queryModes, queryTextKind: normalized.queryTextKind },
      [],
    );

    expect(routed.bm25Queries).toEqual(['auth flow', '"refresh token"']);
    expect(routed.semanticQueries).toEqual(['auth flow', 'token rotation behavior']);
  });

  test('rejects explicit hyde-only modes without a positional query', async () => {
    expect(() =>
      normalizeStructuredQueryInput('', [{ mode: 'hyde', text: 'hypothetical answer' }]),
    ).toThrow(/hyde-only inputs are not allowed/i);
    await expect(
      routeExpandedQueries('', { queryModes: [{ mode: 'hyde', text: 'hypothetical answer' }] }, []),
    ).rejects.toThrow(/hyde-only inputs are not allowed/i);
  });

  test('routes structured modes without invoking generation provider', async () => {
    const provider = {
      generate: vi.fn(async () => '{"lexicalQueries":["generated"],"vectorQueries":["generated"]}'),
    };

    const routed = await routeExpandedQueries(
      'auth flow',
      {
        enabled: true,
        provider,
        queryModes: [
          { mode: 'term', text: '"refresh token"' },
          { mode: 'intent', text: 'token rotation behavior' },
          { mode: 'hyde', text: 'Refresh tokens rotate on each use.' },
        ],
      },
      [],
    );

    expect(provider.generate).not.toHaveBeenCalled();
    expect(routed.skipped).toBeNull();
    expect(routed.expansion).toEqual({
      lexicalQueries: ['"refresh token"'],
      vectorQueries: ['token rotation behavior'],
      hyde: 'Refresh tokens rotate on each use.',
    });
    expect(routed.bm25Queries).toEqual(['auth flow', '"refresh token"']);
    expect(routed.semanticQueries).toEqual([
      'auth flow',
      'token rotation behavior',
      'Refresh tokens rotate on each use.',
    ]);
  });
});
