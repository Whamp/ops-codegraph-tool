import { describe, expect, test } from 'vitest';
import {
  BENCHMARK_MODEL_PRESETS,
  CODE_RETRIEVAL_FIXTURES,
  runRetrievalBenchmark,
} from '../../scripts/retrieval-benchmark.js';

describe('retrieval benchmark harness', () => {
  test('ships code-focused fixtures for every required query category', () => {
    const requiredCategories = [
      'ambiguous-natural-language',
      'code-intent',
      'graph-aware-symbol-context',
      'identifier',
    ];
    const categoryCounts = new Map<string, number>();

    for (const fixture of CODE_RETRIEVAL_FIXTURES) {
      categoryCounts.set(fixture.category, (categoryCounts.get(fixture.category) ?? 0) + 1);
      expect(fixture.query).toBeTruthy();
      expect(fixture.relevantSymbolIds.length).toBeGreaterThan(0);
      expect(fixture.documents.length).toBeGreaterThanOrEqual(3);
    }

    for (const category of requiredCategories) {
      expect(categoryCounts.get(category)).toBeGreaterThanOrEqual(1);
    }
  });

  test('compares current default, notable alternatives, and the GNO/Qwen path in CI-safe smoke mode', async () => {
    const output = await runRetrievalBenchmark({ mode: 'mock', topK: 3 });

    expect(BENCHMARK_MODEL_PRESETS.map((preset) => preset.id)).toEqual([
      'current-default',
      'minilm-baseline',
      'jina-code',
      'gno-qwen-slim-tuned',
    ]);
    expect(output.mode).toBe('mock');
    expect(output.queries).toHaveLength(4);
    expect(Object.keys(output.models)).toEqual(BENCHMARK_MODEL_PRESETS.map((preset) => preset.id));

    for (const result of Object.values(output.models)) {
      expect(result.quality.hitAt1).toBeGreaterThanOrEqual(0);
      expect(result.quality.hitAt3).toBeGreaterThanOrEqual(result.quality.hitAt1);
      expect(result.quality.mrr).toBeGreaterThanOrEqual(0);
      expect(result.runtime.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.embeddingCost.provider).toBe('local');
      expect(result.perQuery).toHaveLength(4);
    }
  });
});
