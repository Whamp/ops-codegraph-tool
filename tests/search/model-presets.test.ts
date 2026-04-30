import { describe, expect, test } from 'vitest';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MODEL,
  DEFAULT_RETRIEVAL_PRESET,
  LEGACY_TRANSFORMER_DEFAULT_MODEL,
  MODELS,
  RETRIEVAL_MODEL_PRESETS,
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
  test('resolves every role from the GNO compact default preset', () => {
    const resolved = resolveRetrievalModels(config());

    expect(DEFAULT_RETRIEVAL_PRESET).toBe('gno-compact');
    expect(DEFAULT_MODEL).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(resolved.preset).toBe('gno-compact');
    expect(resolved.roles.embed).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(resolved.roles.rerank).toContain('Reranker');
    expect(resolved.roles.expand).toContain('Qwen');
    expect(resolved.roles.gen).toContain('Qwen');
  });

  test('keeps codegraph-default available as a legacy compatibility preset', () => {
    const resolved = resolveRetrievalModels({
      ...(DEFAULTS as CodegraphConfig),
      embeddings: { ...DEFAULTS.embeddings },
      models: { ...DEFAULTS.models, preset: 'codegraph-default' },
    });

    expect(resolved.preset).toBe('codegraph-default');
    expect(resolved.roles.embed).toBe(MODELS[LEGACY_TRANSFORMER_DEFAULT_MODEL]!.name);
    expect(resolved.roles.embed).not.toBe(DEFAULT_EMBEDDING_MODEL);
  });

  test('explicit legacy embeddings.model still overrides the legacy compatibility preset', () => {
    const resolved = resolveRetrievalModels(
      config({
        embeddings: { model: 'minilm', llmProvider: null },
        models: { preset: 'codegraph-default' },
      }),
    );

    expect(resolved.preset).toBe('codegraph-default');
    expect(resolved.roles.embed).toBe(MODELS.minilm!.name);
  });

  test('resolves non-default preset embed role with merged default config shape', () => {
    const resolved = resolveRetrievalModels({
      ...(DEFAULTS as CodegraphConfig),
      embeddings: { ...DEFAULTS.embeddings },
      models: { ...DEFAULTS.models, preset: 'gno-balanced' },
    });

    expect(resolved.preset).toBe('gno-balanced');
    expect(resolved.roles.embed).toBe(RETRIEVAL_MODEL_PRESETS['gno-balanced']!.roles.embed);
    expect(resolved.roles.embed).not.toBe(MODELS[LEGACY_TRANSFORMER_DEFAULT_MODEL]!.name);
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
    expect(resolved.roles.embed).toBe(DEFAULT_EMBEDDING_MODEL);
  });

  test('explicit legacy embeddings.model overrides the default embed role compatibility layer', () => {
    const resolved = resolveRetrievalModels(
      config({ embeddings: { model: 'nomic-v1.5', llmProvider: null } }),
    );

    expect(resolved.roles.embed).toBe(MODELS['nomic-v1.5']!.name);
    expect(
      resolveModelRoleUri(
        config({ embeddings: { model: 'nomic-v1.5', llmProvider: null } }),
        'embed',
      ),
    ).toBe(MODELS['nomic-v1.5']!.name);
  });
});
