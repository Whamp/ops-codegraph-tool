import { describe, expect, test } from 'vitest';
import {
  applyExpansionGuardrails,
  expandOrFallback,
  hasStrongBm25Signal,
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
      vectorQueries: ['payments reconciliation', 'AuthService validates JWT token in C++'],
      hyde: 'This passage is about cooking dinner.',
    });

    expect(guarded.lexicalQueries[0]).toContain('C++');
    expect(guarded.lexicalQueries[0]).toContain('"JWT token"');
    expect(guarded.lexicalQueries[0]).toContain('-legacy');
    expect(guarded.lexicalQueries[0]).toContain('AuthService');
    expect(guarded.lexicalQueries).not.toContain('unrelated database migration');
    expect(guarded.vectorQueries).toEqual(['AuthService validates JWT token in C++']);
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
  test('skips expansion for strong BM25 score and gap', async () => {
    expect(
      hasStrongBm25Signal([
        { name: 'authenticate', bm25Score: 0.95 },
        { name: 'authMiddleware', bm25Score: 0.7 },
      ]),
    ).toBe(true);

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
        { name: 'authenticate', bm25Score: 0.95 },
        { name: 'authMiddleware', bm25Score: 0.7 },
      ],
    );

    expect(routed.skipped).toBe('strong_bm25');
    expect(routed.bm25Queries).toEqual(['authenticate']);
    expect(routed.semanticQueries).toEqual(['authenticate']);
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
