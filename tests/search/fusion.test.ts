import { describe, expect, test } from 'vitest';
import { weightedRrfFuse } from '../../src/domain/search/search/fusion.js';

describe('weighted RRF fusion', () => {
  test('weights original sources more strongly than generated variants', () => {
    const [top] = weightedRrfFuse(
      [
        { source: 'bm25_variant', query: 'variant', results: [{ key: 'variant-only', rank: 1 }] },
        { source: 'bm25', query: 'original', results: [{ key: 'original-only', rank: 1 }] },
      ],
      { k: 60, weights: { bm25: 2, bm25_variant: 0.5 }, topRankBonus: 0, topRankThreshold: 3 },
    );

    expect(top?.key).toBe('original-only');
    expect(top?.explain.sources[0]).toMatchObject({ source: 'bm25', weight: 2, rank: 1 });
  });

  test('applies configurable top-rank bonuses', () => {
    const withoutBonus = weightedRrfFuse(
      [
        { source: 'vector_variant', query: 'variant', results: [{ key: 'variant-top', rank: 1 }] },
        { source: 'bm25', query: 'original', results: [{ key: 'original-low', rank: 5 }] },
      ],
      { k: 60, weights: { bm25: 1, vector_variant: 1 }, topRankBonus: 0, topRankThreshold: 3 },
    );
    const withBonus = weightedRrfFuse(
      [
        { source: 'vector_variant', query: 'variant', results: [{ key: 'variant-top', rank: 1 }] },
        { source: 'bm25', query: 'original', results: [{ key: 'original-low', rank: 5 }] },
      ],
      { k: 60, weights: { bm25: 1, vector_variant: 1 }, topRankBonus: 0.1, topRankThreshold: 3 },
    );

    expect(withoutBonus[0]?.key).toBe('variant-top');
    expect(withBonus[0]?.score).toBeGreaterThan(withoutBonus[0]!.score);
    expect(withBonus[0]?.explain.topRankBonus).toBe(0.1);
  });

  test('uses deterministic tie ordering by stable key', () => {
    const fused = weightedRrfFuse(
      [
        { source: 'bm25', query: 'q', results: [{ key: 'b', rank: 1 }] },
        { source: 'vector', query: 'q', results: [{ key: 'a', rank: 1 }] },
      ],
      { k: 60, weights: { bm25: 1, vector: 1 }, topRankBonus: 0, topRankThreshold: 3 },
    );

    expect(fused.map((item) => item.key)).toEqual(['a', 'b']);
  });

  test('tracks multi-query source contributions including HyDE weighting', () => {
    const [candidate] = weightedRrfFuse(
      [
        { source: 'bm25', query: 'original', results: [{ key: 'shared', rank: 2 }] },
        {
          source: 'vector_variant',
          query: 'semantic variant',
          results: [{ key: 'shared', rank: 3 }],
        },
        { source: 'hyde', query: 'hypothetical passage', results: [{ key: 'shared', rank: 1 }] },
      ],
      {
        k: 60,
        weights: { bm25: 2, vector_variant: 0.5, hyde: 0.7 },
        topRankBonus: 0,
        topRankThreshold: 3,
      },
    );

    expect(candidate?.explain.sources.map((source) => source.source)).toEqual([
      'bm25',
      'vector_variant',
      'hyde',
    ]);
    expect(candidate?.explain.sources.find((source) => source.source === 'hyde')).toMatchObject({
      query: 'hypothetical passage',
      rank: 1,
      weight: 0.7,
    });
  });
});
