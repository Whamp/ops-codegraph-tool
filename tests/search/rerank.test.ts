import { describe, expect, test } from 'vitest';
import {
  type RerankCandidate,
  type RerankPort,
  rerankCandidates,
} from '../../src/domain/search/search/rerank.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<RerankCandidate> = {}): RerankCandidate {
  return {
    key: `func:file.ts:${overrides.line ?? 1}`,
    name: overrides.name ?? 'testFunc',
    kind: overrides.kind ?? 'function',
    file: overrides.file ?? 'file.ts',
    line: overrides.line ?? 1,
    fusionScore: overrides.fusionScore ?? 0.1,
    bm25Rank: overrides.bm25Rank ?? null,
    text: overrides.text ?? 'function testFunc() { return 1; }',
    ...overrides,
  };
}

/** Create a mock RerankPort that returns fixed scores. */
function mockPort(scores: Array<{ index: number; score: number }>): RerankPort {
  return {
    async rerank(_query: string, _documents: string[]) {
      return {
        ok: true as const,
        value: scores.map((s) => ({ index: s.index, score: s.score })),
      };
    },
  };
}

/** Create a mock RerankPort that always fails. */
function failingPort(errorMsg = 'model unavailable'): RerankPort {
  return {
    async rerank() {
      return { ok: false as const, error: new Error(errorMsg) };
    },
  };
}

/** Create a mock RerankPort that throws. */
function throwingPort(errorMsg = 'catastrophic'): RerankPort {
  return {
    async rerank() {
      throw new Error(errorMsg);
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('rerankCandidates', () => {
  // ── Fallback when no port ─────────────────────────────────────────

  test('returns fusion-only ordering with normalized scores when rerank port is null', async () => {
    const candidates = [
      makeCandidate({ key: 'a', name: 'alpha', fusionScore: 0.3 }),
      makeCandidate({ key: 'b', name: 'beta', fusionScore: 0.1 }),
      makeCandidate({ key: 'c', name: 'gamma', fusionScore: 0.2 }),
    ];

    const result = await rerankCandidates(null, 'test query', candidates);

    expect(result.reranked).toBe(false);
    expect(result.fallbackReason).toBe('disabled');
    expect(result.candidates[0]?.name).toBe('alpha');
    expect(result.candidates[0]?.rerankScore).toBeNull();
    // Normalized: alpha=1, gamma=0.5, beta=0
    expect(result.candidates[0]?.blendedScore).toBeCloseTo(1);
    expect(result.candidates[1]?.name).toBe('gamma');
    expect(result.candidates[1]?.blendedScore).toBeCloseTo(0.5);
    expect(result.candidates[2]?.name).toBe('beta');
    expect(result.candidates[2]?.blendedScore).toBeCloseTo(0);
  });

  test('returns empty candidates unchanged', async () => {
    const result = await rerankCandidates(null, 'q', []);
    expect(result.candidates).toEqual([]);
    expect(result.reranked).toBe(false);
    expect(result.fallbackReason).toBe('none');
  });

  // ── Fallback on rerank error ──────────────────────────────────────

  test('falls back to fusion-only with error metadata when port returns failure', async () => {
    const candidates = [
      makeCandidate({ key: 'a', name: 'alpha', fusionScore: 0.5 }),
      makeCandidate({ key: 'b', name: 'beta', fusionScore: 0.2 }),
    ];

    const result = await rerankCandidates(failingPort(), 'test query', candidates);

    expect(result.reranked).toBe(false);
    expect(result.fallbackReason).toBe('error');
    expect(result.candidates[0]?.name).toBe('alpha');
    expect(result.candidates[0]?.rerankScore).toBeNull();
    expect(result.candidates[0]?.explain?.rerankFallback).toBe(true);
  });

  test('falls back gracefully when port throws an exception', async () => {
    const candidates = [makeCandidate({ key: 'a', fusionScore: 0.5 })];

    const result = await rerankCandidates(throwingPort(), 'q', candidates);

    expect(result.reranked).toBe(false);
    expect(result.fallbackReason).toBe('error');
    expect(result.candidates[0]?.rerankScore).toBeNull();
  });

  // ── Successful reranking ──────────────────────────────────────────

  test('reranks candidates and blends scores with fusion', async () => {
    const candidates = [
      makeCandidate({ key: 'a', name: 'alpha', fusionScore: 0.1 }),
      makeCandidate({ key: 'b', name: 'beta', fusionScore: 0.5 }),
    ];

    // Port scores beta higher (index 0 → alpha gets 0.2, index 1 → beta gets 0.9)
    const port = mockPort([
      { index: 0, score: 0.2 },
      { index: 1, score: 0.9 },
    ]);

    const result = await rerankCandidates(port, 'test query', candidates, {
      fusionWeight: 0.4,
      rerankWeight: 0.6,
    });

    expect(result.reranked).toBe(true);
    expect(result.fallbackReason).toBe('none');
    // Beta should still rank higher due to high rerank + fusion
    expect(result.candidates[0]?.name).toBe('beta');
    expect(result.candidates[0]?.rerankScore).not.toBeNull();
  });

  // ── Candidate limits ──────────────────────────────────────────────

  test('respects maxCandidates limit — only top fusion candidates are reranked', async () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeCandidate({
        key: `c${i}`,
        name: `c${i}`,
        fusionScore: 0.5 - i * 0.04,
        text: `function c${i}() { return ${i}; }`,
      }),
    );

    let rerankCallCount = 0;
    const port: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        rerankCallCount = documents.length;
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: 0.5 })),
        };
      },
    };

    const result = await rerankCandidates(port, 'q', candidates, { maxCandidates: 3 });

    expect(rerankCallCount).toBe(3);
    expect(result.reranked).toBe(true);
    // All 10 candidates should be returned (3 reranked + 7 remaining with penalty)
    expect(result.candidates.length).toBe(10);
  });

  // ── Lexical-hit protection ────────────────────────────────────────

  test('protects BM25 rank-1 hit from rerank-only demotion', async () => {
    const candidates = [
      makeCandidate({
        key: 'lexical-top',
        name: 'exactMatch',
        fusionScore: 0.2,
        bm25Rank: 1,
        lexicalExactTopHit: true,
        text: 'function exactMatch() {}',
      }),
      makeCandidate({
        key: 'semantic-hit',
        name: 'relatedFunc',
        fusionScore: 0.5,
        bm25Rank: null,
        text: 'function relatedFunc() {}',
      }),
    ];

    // Port gives the semantic hit a much higher score
    const port = mockPort([
      { index: 0, score: 0.1 },
      { index: 1, score: 0.99 },
    ]);

    const result = await rerankCandidates(port, 'exactMatch', candidates, {
      fusionWeight: 0.3,
      rerankWeight: 0.7,
    });

    expect(result.reranked).toBe(true);
    // The lexical top hit should be protected at position 0
    expect(result.candidates[0]?.name).toBe('exactMatch');
    expect(result.candidates[0]?.explain?.protectedLexicalHit).toBe(true);
  });

  test('does not protect when bm25Rank is not 1', async () => {
    const candidates = [
      makeCandidate({ key: 'a', name: 'a', fusionScore: 0.2, bm25Rank: 2 }),
      makeCandidate({ key: 'b', name: 'b', fusionScore: 0.5, bm25Rank: null }),
    ];

    const port = mockPort([
      { index: 0, score: 0.1 },
      { index: 1, score: 0.9 },
    ]);

    const result = await rerankCandidates(port, 'q', candidates, {
      fusionWeight: 0.3,
      rerankWeight: 0.7,
    });

    expect(result.reranked).toBe(true);
    // b should be first (higher fusion + rerank)
    expect(result.candidates[0]?.name).toBe('b');
    expect(result.candidates[0]?.explain?.protectedLexicalHit).toBeFalsy();
  });

  // ── Deterministic tie-breaking ────────────────────────────────────

  test('breaks ties deterministically by key', async () => {
    const candidates = [
      makeCandidate({ key: 'b', name: 'b', fusionScore: 0.5, text: 'same text' }),
      makeCandidate({ key: 'a', name: 'a', fusionScore: 0.5, text: 'same text' }),
    ];

    // Same rerank scores → tie
    const port = mockPort([
      { index: 0, score: 0.5 },
      { index: 1, score: 0.5 },
    ]);

    const result = await rerankCandidates(port, 'q', candidates, {
      fusionWeight: 0.5,
      rerankWeight: 0.5,
    });

    expect(result.candidates[0]?.key).toBe('a');
    expect(result.candidates[1]?.key).toBe('b');
  });

  // ── Intent-aware rerank query ─────────────────────────────────────

  test('uses intent-aware query when intent is provided', async () => {
    let capturedQuery = '';
    const port: RerankPort = {
      async rerank(query: string, documents: string[]) {
        capturedQuery = query;
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: 0.5 })),
        };
      },
    };

    const candidates = [makeCandidate({ key: 'a', text: 'code' })];

    await rerankCandidates(port, 'find auth', candidates, {
      intent: 'user wants to locate authentication middleware',
    });

    // Intent-aware query should include the intent context
    expect(capturedQuery).toContain('find auth');
    expect(capturedQuery).toContain('user wants to locate authentication middleware');
  });

  test('uses plain query when no intent is provided', async () => {
    let capturedQuery = '';
    const port: RerankPort = {
      async rerank(query: string, documents: string[]) {
        capturedQuery = query;
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: 0.5 })),
        };
      },
    };

    const candidates = [makeCandidate({ key: 'a', text: 'code' })];

    await rerankCandidates(port, 'simple query', candidates);

    expect(capturedQuery).toBe('simple query');
  });

  // ── Duplicate text deduplication ──────────────────────────────────

  test('deduplicates identical texts before calling port and maps scores back', async () => {
    const candidates = [
      makeCandidate({ key: 'a', name: 'a', text: 'identical code' }),
      makeCandidate({ key: 'b', name: 'b', text: 'identical code' }),
      makeCandidate({ key: 'c', name: 'c', text: 'different code' }),
    ];

    let passedDocuments: string[] = [];
    const port: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        passedDocuments = documents;
        // Score the unique texts
        return {
          ok: true as const,
          value: documents.map((_, i) => ({ index: i, score: i === 0 ? 0.8 : 0.3 })),
        };
      },
    };

    const result = await rerankCandidates(port, 'q', candidates);

    // Only 2 unique texts should have been sent
    expect(passedDocuments.length).toBe(2);
    expect(passedDocuments).toContain('identical code');
    expect(passedDocuments).toContain('different code');
    expect(result.reranked).toBe(true);
    // Both 'a' and 'b' should get the same rerank score (mapped from dedup)
    const a = result.candidates.find((c) => c.key === 'a');
    const b = result.candidates.find((c) => c.key === 'b');
    expect(a?.rerankScore).toBeCloseTo(b?.rerankScore ?? -1);
  });

  // ── Score normalization ───────────────────────────────────────────

  test('normalizes fusion scores to 0-1 range', async () => {
    const candidates = [
      makeCandidate({ key: 'a', fusionScore: 0.5 }),
      makeCandidate({ key: 'b', fusionScore: 0.1 }),
    ];

    const result = await rerankCandidates(null, 'q', candidates);

    // a: (0.5 - 0.1) / (0.5 - 0.1) = 1.0
    // b: (0.1 - 0.1) / (0.5 - 0.1) = 0.0
    expect(result.candidates[0]?.blendedScore).toBeCloseTo(1);
    expect(result.candidates[1]?.blendedScore).toBeCloseTo(0);
  });

  test('handles single candidate normalization (range = 0)', async () => {
    const candidates = [makeCandidate({ key: 'a', fusionScore: 0.5 })];

    const result = await rerankCandidates(null, 'q', candidates);

    expect(result.candidates[0]?.blendedScore).toBeCloseTo(1);
  });

  // ── Text extraction fallback ──────────────────────────────────────

  test('selects full text before content and preview fields', async () => {
    const candidates = [
      makeCandidate({
        key: 'a',
        text: undefined,
        full_text: 'full snake text',
        fullText: 'full camel text',
        content: 'fts content',
        text_preview: 'preview snake',
        textPreview: 'preview camel',
      } as Partial<RerankCandidate>),
      makeCandidate({
        key: 'b',
        text: undefined,
        content: 'fts content beats preview',
        text_preview: 'preview loses',
      } as Partial<RerankCandidate>),
    ];

    let passedDocuments: string[] = [];
    const port: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        passedDocuments = documents;
        return {
          ok: true as const,
          value: documents.map((_, index) => ({ index, score: 0.5 })),
        };
      },
    };

    await rerankCandidates(port, 'q', candidates);

    expect(passedDocuments).toEqual(['full snake text', 'fts content beats preview']);
  });

  test('uses name/file/line as fallback text when no text provided', async () => {
    const candidates = [
      makeCandidate({ key: 'a', name: 'myFunc', file: 'src/mod.ts', line: 42, text: undefined }),
    ];

    let passedDocuments: string[] = [];
    const port: RerankPort = {
      async rerank(_query: string, documents: string[]) {
        passedDocuments = documents;
        return {
          ok: true as const,
          value: [{ index: 0, score: 0.5 }],
        };
      },
    };

    await rerankCandidates(port, 'q', candidates as any);

    expect(passedDocuments[0]).toContain('myFunc');
    expect(passedDocuments[0]).toContain('src/mod.ts');
    expect(passedDocuments[0]).toContain('42');
  });

  // ── Remaining candidates penalty ──────────────────────────────────

  test('applies penalty to candidates beyond maxCandidates', async () => {
    const candidates = [
      makeCandidate({ key: 'a', fusionScore: 0.8 }),
      makeCandidate({ key: 'b', fusionScore: 0.5 }),
      makeCandidate({ key: 'c', fusionScore: 0.3 }),
    ];

    const port = mockPort([
      { index: 0, score: 0.5 },
      { index: 1, score: 0.5 },
    ]);

    const result = await rerankCandidates(port, 'q', candidates, { maxCandidates: 2 });

    expect(result.reranked).toBe(true);
    // Candidate 'c' (index 2) was not reranked — should have rerankScore null
    const c = result.candidates.find((c) => c.key === 'c');
    expect(c?.rerankScore).toBeNull();
    // Its blended score should be penalized (fusion-only × 0.5)
    expect(c?.blendedScore).toBeLessThan(0.5);
  });

  // ── Explain metadata ──────────────────────────────────────────────

  test('includes rerank explain metadata on each candidate', async () => {
    const candidates = [makeCandidate({ key: 'a', fusionScore: 0.5 })];

    const port = mockPort([{ index: 0, score: 0.8 }]);

    const result = await rerankCandidates(port, 'q', candidates, {
      fusionWeight: 0.4,
      rerankWeight: 0.6,
    });

    expect(result.candidates[0]?.explain).toBeDefined();
    expect(result.candidates[0]?.explain?.fusionWeight).toBe(0.4);
    expect(result.candidates[0]?.explain?.rerankWeight).toBe(0.6);
    expect(result.candidates[0]?.explain?.normalizedFusion).toBeDefined();
    expect(result.candidates[0]?.explain?.normalizedRerank).toBeDefined();
  });

  test('includes fallback explain metadata when reranker fails', async () => {
    const candidates = [makeCandidate({ key: 'a', fusionScore: 0.5 })];

    const result = await rerankCandidates(failingPort(), 'q', candidates);

    expect(result.candidates[0]?.explain?.rerankFallback).toBe(true);
  });
});
