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

  test('shows active GNO roles and preset before legacy aliases', () => {
    const output = runModelsCommand();

    // Preset line
    expect(output).toContain('Preset: gno-compact');

    // Roles — short form
    expect(output).toContain('embed    Qwen/Qwen3-Embedding-0.6B-Q8_0.gguf');
    expect(output).toContain('rerank   ggml-org/qwen3-reranker-0.6b-q8_0.gguf');
    expect(output).toContain('expand   unsloth/Qwen3-1.7B-Q4_K_M.gguf');
    expect(output).toContain('gen      unsloth/Qwen3-1.7B-Q4_K_M.gguf');

    // Presets section
    expect(output).toContain('Presets:');
    expect(output).toMatch(/gno-compact\s+.*←/);
    expect(output).toContain('gno-balanced');
    expect(output).toContain('gno-quality');

    // Legacy aliases come last
    expect(output).toContain('Embedding aliases (--model):');
    expect(output).not.toContain('Available embedding models:');
    expect(output.indexOf('Preset:')).toBeLessThan(output.indexOf('Embedding aliases (--model):'));
  });

  test('shows resolved preset when config overrides it', () => {
    const output = runModelsCommand({
      embeddings: { model: 'minilm', llmProvider: null },
      models: { preset: 'gno-balanced' },
    });

    expect(output).toContain('Preset: gno-balanced');
    expect(output).toContain('embed    Qwen/Qwen3-Embedding-0.6B-Q8_0.gguf');
    expect(output).not.toMatch(/minilm.*←/);
  });

  test('labels a configured legacy alias as the active embed', () => {
    const output = runModelsCommand({
      embeddings: { model: 'bge-large', llmProvider: null },
    });

    // Role shows the resolved URI
    expect(output).toContain('embed    Xenova/bge-large-en-v1.5');

    // Alias table marks it
    expect(output).toMatch(/bge-large\s+1024d\s+512 ctx\s+Best general retrieval.*← active/);
  });
});
