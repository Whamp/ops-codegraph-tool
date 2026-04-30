import { afterEach, describe, expect, test, vi } from 'vitest';
import { command } from '../../src/cli/commands/models.js';
import type { CliContext } from '../../src/cli/types.js';
import { DEFAULTS } from '../../src/infrastructure/config.js';
import type { CodegraphConfig } from '../../src/types.js';

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

describe('models command defaults', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('marks the resolved embed role instead of stale embeddings.model', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    command.execute?.(
      [],
      {},
      ctx({
        embeddings: { model: 'minilm', llmProvider: null },
        models: { preset: 'gno-balanced' },
      }),
    );

    const output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain(
      'Default embedding role: hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf',
    );
    expect(output).not.toMatch(/minilm.*\(default\)/);
  });
});
