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

function runModelsCommand(config: Partial<CodegraphConfig> = {}): string {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  command.execute?.([], {}, ctx(config));
  return log.mock.calls.map((call) => call.join(' ')).join('\n');
}

describe('models command defaults', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows active GNO retrieval roles before legacy embedding aliases', () => {
    const output = runModelsCommand();

    expect(output).toContain('Active retrieval preset: gno-compact');
    expect(output).toContain('Active retrieval roles:');
    expect(output).toContain(
      'embed   hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf',
    );
    expect(output).toContain(
      'rerank  hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf',
    );
    expect(output).toContain('Retrieval presets:');
    expect(output).toMatch(/gno-compact\s+\(active\)/);
    expect(output).toContain('gno-balanced');
    expect(output).toContain('gno-quality');
    expect(output).toContain('Embedding aliases (--model overrides):');
    expect(output).not.toContain('Available embedding models:');
    expect(output.indexOf('Active retrieval roles:')).toBeLessThan(
      output.indexOf('Embedding aliases (--model overrides):'),
    );
  });

  test('marks resolved embed overrides without calling legacy aliases the default', () => {
    const output = runModelsCommand({
      embeddings: { model: 'minilm', llmProvider: null },
      models: { preset: 'gno-balanced' },
    });

    expect(output).toContain('Active retrieval preset: gno-balanced');
    expect(output).toContain(
      'embed   hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf',
    );
    expect(output).not.toMatch(/minilm.*\(default\)/);
  });

  test('labels a configured legacy embedding alias as the active embed role', () => {
    const output = runModelsCommand({
      embeddings: { model: 'bge-large', llmProvider: null },
    });

    expect(output).toContain('embed   Xenova/bge-large-en-v1.5');
    expect(output).toMatch(
      /bge-large\s+1024d\s+512 ctx\s+Best general retrieval.*\(active embed\)/,
    );
  });
});
