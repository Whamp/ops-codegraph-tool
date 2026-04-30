import { describe, expect, test } from 'vitest';
import {
  applyExpansionGuardrails,
  expandOrFallback,
  parseExpansionOutput,
  routeExpandedQueries,
} from '../../src/domain/search/search/expansion.js';

describe('query expansion parsing and guardrails', () => {
  test('parses JSON embedded in model output and caps variants', () => {
    const parsed = parseExpansionOutput(
      'text before {"lexicalQueries":["auth login","auth signin","auth token","auth session","auth user","auth extra"],"vectorQueries":["auth users","authorization flow"],"hyde":"auth modules authenticate users and issue tokens."} text after',
      'auth',
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.lexicalQueries).toHaveLength(5);
    expect(parsed?.lexicalQueries).toContain('auth login');
    expect(parsed?.vectorQueries).toContain('auth users');
    expect(parsed?.hyde).toContain('auth modules');
  });

  test('preserves technical anchors and filters drifted variants', () => {
    const guarded = applyExpansionGuardrails('find C++ "JWT token" -legacy AuthService', {
      lexicalQueries: ['unrelated database migration', 'AuthService validates JWT token'],
      vectorQueries: ['payments reconciliation', 'AuthService validates JWT token in C++ -legacy'],
      hyde: 'This passage is about cooking dinner.',
    });

    expect(guarded.lexicalQueries[0]).toContain('C++');
    expect(guarded.lexicalQueries[0]).toContain('"JWT token"');
    expect(guarded.lexicalQueries[0]).toContain('-legacy');
    expect(guarded.lexicalQueries[0]).toContain('AuthService');
    expect(guarded.lexicalQueries).not.toContain('unrelated database migration');
    expect(guarded.vectorQueries).toEqual(['AuthService validates JWT token in C++ -legacy']);
    expect(guarded.hyde).toBeUndefined();
  });

  test('rejects negation drift and does not let positive negated tokens satisfy anchors', () => {
    const guarded = applyExpansionGuardrails('AuthService -legacy', {
      lexicalQueries: ['legacy auth migration', 'AuthService migration'],
      vectorQueries: ['legacy auth migration', 'AuthService migration -legacy'],
      hyde: 'AuthService migration recommends legacy compatibility.',
    });

    expect(guarded.lexicalQueries).toContain('AuthService -legacy');
    expect(guarded.lexicalQueries).not.toContain('legacy auth migration');
    expect(guarded.lexicalQueries).not.toContain('AuthService migration');
    expect(guarded.vectorQueries).toEqual(['AuthService migration -legacy']);
    expect(guarded.hyde).toBeUndefined();
  });

  test('requires quoted phrases rather than accepting partial phrase overlap', () => {
    const guarded = applyExpansionGuardrails('debug "JWT token" parser', {
      lexicalQueries: ['JWT parser', 'token parser'],
      vectorQueries: ['JWT parser internals', 'debug JWT token parser'],
      hyde: 'The parser handles JWT values but omits token phrase context.',
    });

    expect(guarded.lexicalQueries).toEqual(['"JWT token"']);
    expect(guarded.vectorQueries).toEqual(['debug JWT token parser']);
    expect(guarded.hyde).toBeUndefined();
  });

  test('preserves acronyms code symbols and critical entities exactly', () => {
    const guarded = applyExpansionGuardrails('React.useEffect C++ JWT AuthService', {
      lexicalQueries: ['react hooks authservice jwt', 'React.useEffect JWT'],
      vectorQueries: [
        'react hooks authservice jwt',
        'React.useEffect C++ JWT AuthService lifecycle',
      ],
      hyde: 'React hooks discuss authservice jwt behavior without the exact code symbols.',
    });

    expect(guarded.lexicalQueries).toContain('React.useEffect C++ JWT AuthService');
    expect(guarded.lexicalQueries).not.toContain('react hooks authservice jwt');
    expect(guarded.vectorQueries).toEqual(['React.useEffect C++ JWT AuthService lifecycle']);
    expect(guarded.hyde).toBeUndefined();
  });

  test('treats identifier-like code tokens with underscores as critical anchors', () => {
    const guarded = applyExpansionGuardrails('parse_url migration', {
      lexicalQueries: ['url parser migration', 'parse_url migration steps'],
      vectorQueries: ['URL parser migration', 'parse_url migration guide'],
      hyde: 'This migration updates URL parser behavior without naming the identifier.',
    });

    expect(guarded.lexicalQueries).toContain('parse_url');
    expect(guarded.lexicalQueries).not.toContain('url parser migration');
    expect(guarded.vectorQueries).toEqual(['parse_url migration guide']);
    expect(guarded.hyde).toBeUndefined();
  });

  test('does not parse hyphenated symbols as negation anchors', () => {
    const guarded = applyExpansionGuardrails('foo-bar migration', {
      lexicalQueries: ['foo-bar migration plan'],
      vectorQueries: ['foo-bar migration notes'],
    });

    expect(guarded.lexicalQueries).not.toContain('-bar');
    expect(guarded.lexicalQueries).toContain('foo-bar migration plan');
    expect(guarded.vectorQueries).toEqual(['foo-bar migration notes']);
  });

  test('rejects positive occurrence of negated values outside explicit negation spans', () => {
    const guarded = applyExpansionGuardrails('AuthService -legacy migration', {
      lexicalQueries: ['AuthService -legacy legacy migration', 'AuthService -legacy migration'],
      vectorQueries: [
        'AuthService -legacy legacy migration details',
        'AuthService -legacy migration details',
      ],
      hyde: 'AuthService -legacy migration should still describe legacy compatibility positively.',
    });

    expect(guarded.lexicalQueries).not.toContain('AuthService -legacy legacy migration');
    expect(guarded.lexicalQueries).toContain('AuthService -legacy migration');
    expect(guarded.vectorQueries).toEqual(['AuthService -legacy migration details']);
    expect(guarded.hyde).toBeUndefined();
  });

  test('returns null on invalid output and falls back on provider failure or timeout', async () => {
    expect(parseExpansionOutput('not json', 'auth')).toBeNull();

    await expect(
      expandOrFallback('auth', {
        enabled: true,
        provider: {
          generate: async () => {
            throw new Error('boom');
          },
        },
      }),
    ).resolves.toBeNull();

    await expect(
      expandOrFallback('auth', {
        enabled: true,
        timeoutMs: 1,
        provider: { generate: () => new Promise<string>(() => {}) },
      }),
    ).resolves.toBeNull();
  });
});

describe('query expansion routing', () => {
  test('skips expansion for exact-name BM25 hits even with tiny FTS5 scores', async () => {
    const routed = await routeExpandedQueries(
      'authenticate',
      {
        enabled: true,
        provider: {
          generate: async () =>
            '{"lexicalQueries":["jwt"],"vectorQueries":["jwt"],"hyde":"jwt token validation"}',
        },
      },
      [
        { name: 'authenticate', bm25Score: 0.000012 },
        { name: 'authMiddleware', bm25Score: 0.000004 },
      ],
    );

    expect(routed.skipped).toBe('strong_bm25');
    expect(routed.bm25Queries).toEqual(['authenticate']);
    expect(routed.semanticQueries).toEqual(['authenticate']);
  });

  test('does not skip expansion for high non-exact BM25 scores alone', async () => {
    const routed = await routeExpandedQueries(
      'auth migration',
      {
        enabled: true,
        provider: {
          generate: async () =>
            '{"lexicalQueries":["auth login"],"vectorQueries":["auth token validation"],"hyde":"auth migration token validation"}',
        },
      },
      [
        { name: 'authenticate', bm25Score: 0.95 },
        { name: 'authMiddleware', bm25Score: 0.7 },
      ],
    );

    expect(routed.skipped).toBeNull();
    expect(routed.bm25Queries).toContain('auth login');
  });

  test('routes lexical variants only to BM25 and vector/HyDE variants only to semantic', async () => {
    const routed = await routeExpandedQueries(
      'auth',
      {
        enabled: true,
        provider: {
          generate: async () =>
            '{"lexicalQueries":["auth login"],"vectorQueries":["auth token validation"],"hyde":"auth middleware validates tokens for requests"}',
        },
      },
      [],
    );

    expect(routed.bm25Queries).toEqual(['auth', 'auth login']);
    expect(routed.semanticQueries).toEqual([
      'auth',
      'auth token validation',
      'auth middleware validates tokens for requests',
    ]);
  });

  test('degrades to original query when no expansion provider is available', async () => {
    const routed = await routeExpandedQueries('auth', { enabled: true }, []);

    expect(routed.skipped).toBe('no_provider');
    expect(routed.bm25Queries).toEqual(['auth']);
    expect(routed.semanticQueries).toEqual(['auth']);
  });
});
