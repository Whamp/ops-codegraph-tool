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

  test('routes implicit supported Qwen GGUF preset embed URI through buildEmbeddings', async () => {
    const config = ctx({ models: { preset: 'slim' } });

    expect(resolveModelRoleUri(config.config, 'embed')).toBe(
      RETRIEVAL_MODEL_PRESETS.slim!.roles.embed,
    );

    await command.execute?.(['.'], { strategy: 'structured' }, config);

    expect(buildEmbeddingsMock).toHaveBeenCalledWith(
      expect.any(String),
      RETRIEVAL_MODEL_PRESETS.slim!.roles.embed,
      undefined,
      { strategy: 'structured' },
    );
  });

  test('routes implicit GNO/Qwen default embed URI through buildEmbeddings', async () => {
    await command.execute?.(['.'], { strategy: 'structured' }, ctx());

    expect(buildEmbeddingsMock).toHaveBeenCalledWith(
      expect.any(String),
      'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf',
      undefined,
      { strategy: 'structured' },
    );
  });

  test('preserves explicit Qwen --model for the port factory', async () => {
    await command.execute?.(
      ['.'],
      {
        strategy: 'structured',
        model: 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf',
      },
      ctx({ models: { preset: 'slim' } }),
    );

    expect(buildEmbeddingsMock).toHaveBeenCalledWith(
      expect.any(String),
      'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf',
      undefined,
      { strategy: 'structured' },
    );
  });
});
