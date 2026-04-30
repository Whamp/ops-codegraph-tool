import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CliContext } from '../../src/cli/types.js';
import { DEFAULTS } from '../../src/infrastructure/config.js';
import type { CodegraphConfig } from '../../src/types.js';

const buildEmbeddingsMock = vi.fn();

vi.mock('../../src/domain/search/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/domain/search/index.js')>();
  return {
    ...actual,
    buildEmbeddings: buildEmbeddingsMock,
  };
});

const { command } = await import('../../src/cli/commands/embed.js');
const { RETRIEVAL_MODEL_PRESETS, resolveModelRoleUri } = await import(
  '../../src/domain/search/index.js'
);

function ctx(config: Partial<CodegraphConfig> = {}): CliContext {
  return {
    config: {
      ...(DEFAULTS as CodegraphConfig),
      ...config,
      embeddings: { ...DEFAULTS.embeddings, ...config.embeddings },
    } as CodegraphConfig,
    resolveNoTests: () => false,
    resolveQueryOpts: (opts) => opts,
    formatSize: (bytes) => `${bytes}B`,
    outputResult: () => false,
    program: {} as CliContext['program'],
  };
}

describe('embed command model compatibility', () => {
  beforeEach(() => {
    buildEmbeddingsMock.mockClear();
  });

  test('falls back to legacy embedding model for implicit unsupported preset embed URI', async () => {
    const config = ctx({ models: { preset: 'gno-compact' } });

    expect(resolveModelRoleUri(config.config, 'embed')).toBe(
      RETRIEVAL_MODEL_PRESETS['gno-compact']!.roles.embed,
    );

    await command.execute?.(['.'], { strategy: 'structured' }, config);

    expect(buildEmbeddingsMock).toHaveBeenCalledWith(
      expect.any(String),
      DEFAULTS.embeddings.model,
      undefined,
      { strategy: 'structured' },
    );
    expect(buildEmbeddingsMock.mock.calls[0]?.[1]).not.toMatch(/^hf:/);
  });

  test('uses implicit supported role model names without falling back', async () => {
    await command.execute?.(['.'], { strategy: 'structured' }, ctx());

    expect(buildEmbeddingsMock).toHaveBeenCalledWith(
      expect.any(String),
      'nomic-ai/nomic-embed-text-v1.5',
      undefined,
      { strategy: 'structured' },
    );
  });

  test('preserves explicit unsupported --model so buildEmbeddings reports the existing error', async () => {
    await command.execute?.(
      ['.'],
      { strategy: 'structured', model: 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF' },
      ctx({ models: { preset: 'gno-compact' } }),
    );

    expect(buildEmbeddingsMock).toHaveBeenCalledWith(
      expect.any(String),
      'hf:Qwen/Qwen3-Embedding-0.6B-GGUF',
      undefined,
      { strategy: 'structured' },
    );
  });
});
