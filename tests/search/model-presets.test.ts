import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODEL,
  DEFAULT_RETRIEVAL_PRESET,
  MODELS,
  resolveModelRoleUri,
  resolveRetrievalModels,
} from '../../src/domain/search/index.js';
import { DEFAULTS } from '../../src/infrastructure/config.js';
import type { CodegraphConfig } from '../../src/types.js';

function config(overrides: Partial<CodegraphConfig> = {}): CodegraphConfig {
  return {
    ...(DEFAULTS as CodegraphConfig),
    ...overrides,
    embeddings: { ...DEFAULTS.embeddings, ...overrides.embeddings },
    models: overrides.models,
  } as CodegraphConfig;
}

describe('retrieval model role resolution', () => {
  test('resolves every role from the default preset without changing the legacy embed default', () => {
    const resolved = resolveRetrievalModels(config());

    expect(resolved.preset).toBe(DEFAULT_RETRIEVAL_PRESET);
    expect(resolved.roles.embed).toBe(MODELS[DEFAULT_MODEL]!.name);
    expect(resolved.roles.rerank).toContain('Reranker');
    expect(resolved.roles.expand).toContain('Qwen');
    expect(resolved.roles.gen).toContain('Qwen');
  });

  test('applies config role overrides on top of the selected built-in preset', () => {
    const resolved = resolveRetrievalModels(
      config({
        models: {
          preset: 'gno-compact',
          roles: {
            embed: 'hf:custom/embed-model',
            rerank: 'http://localhost:8080/rerank',
          },
        },
      }),
    );

    expect(resolved.preset).toBe('gno-compact');
    expect(resolved.roles.embed).toBe('hf:custom/embed-model');
    expect(resolved.roles.rerank).toBe('http://localhost:8080/rerank');
    expect(resolved.roles.expand).toBeTruthy();
    expect(resolved.roles.gen).toBeTruthy();
  });

  test('falls back to the default preset when config names an invalid preset', () => {
    const resolved = resolveRetrievalModels(config({ models: { preset: 'not-real' } }));

    expect(resolved.preset).toBe(DEFAULT_RETRIEVAL_PRESET);
    expect(resolved.requestedPreset).toBe('not-real');
    expect(resolved.roles.embed).toBe(MODELS[DEFAULT_MODEL]!.name);
  });

  test('uses legacy embeddings.model as the embed role compatibility layer', () => {
    const resolved = resolveRetrievalModels(
      config({ embeddings: { model: 'minilm', llmProvider: null } }),
    );

    expect(resolved.roles.embed).toBe(MODELS.minilm!.name);
    expect(
      resolveModelRoleUri(config({ embeddings: { model: 'minilm', llmProvider: null } }), 'embed'),
    ).toBe(MODELS.minilm!.name);
  });
});
