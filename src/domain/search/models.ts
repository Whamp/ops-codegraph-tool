import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { info } from '../../infrastructure/logger.js';
import { ConfigError, EngineError } from '../../shared/errors.js';
import type { CodegraphConfig } from '../../types.js';

export type ModelRole = 'embed' | 'rerank' | 'expand' | 'gen';
export type ModelRoleMap = Record<ModelRole, string>;

export interface ModelConfig {
  name: string;
  dim: number;
  contextWindow: number;
  desc: string;
  quantized: boolean;
}

// Lazy-load transformers (heavy, optional module)
let pipeline: unknown = null;
let extractor: null | {
  dispose(): Promise<void>;
  (batch: string[], opts: Record<string, unknown>): Promise<{ data: number[] }>;
} = null;
let activeModel: string | null = null;

export const MODELS: Record<string, ModelConfig> = {
  minilm: {
    name: 'Xenova/all-MiniLM-L6-v2',
    dim: 384,
    contextWindow: 256,
    desc: 'Smallest, fastest (~23MB). General text.',
    quantized: true,
  },
  'jina-small': {
    name: 'Xenova/jina-embeddings-v2-small-en',
    dim: 512,
    contextWindow: 8192,
    desc: 'Small, good quality (~33MB). General text.',
    quantized: false,
  },
  'jina-base': {
    name: 'Xenova/jina-embeddings-v2-base-en',
    dim: 768,
    contextWindow: 8192,
    desc: 'Good quality (~137MB). General text, 8192 token context.',
    quantized: false,
  },
  'jina-code': {
    name: 'Xenova/jina-embeddings-v2-base-code',
    dim: 768,
    contextWindow: 8192,
    desc: 'Code-aware (~137MB). Trained on code+text, best for code search.',
    quantized: false,
  },
  nomic: {
    name: 'Xenova/nomic-embed-text-v1',
    dim: 768,
    contextWindow: 8192,
    desc: 'Good local quality (~137MB). 8192 context.',
    quantized: false,
  },
  'nomic-v1.5': {
    name: 'nomic-ai/nomic-embed-text-v1.5',
    dim: 768,
    contextWindow: 8192,
    desc: 'Improved nomic (~137MB). Matryoshka dimensions, 8192 context.',
    quantized: false,
  },
  'bge-large': {
    name: 'Xenova/bge-large-en-v1.5',
    dim: 1024,
    contextWindow: 512,
    desc: 'Best general retrieval (~335MB). Top MTEB scores.',
    quantized: false,
  },
};

export const EMBEDDING_STRATEGIES: readonly string[] = ['structured', 'source'];

export const DEFAULT_MODEL: string = 'nomic-v1.5';
export const DEFAULT_RETRIEVAL_PRESET = 'codegraph-default';

export interface RetrievalModelPreset {
  name: string;
  desc: string;
  roles: ModelRoleMap;
}

export interface ResolvedRetrievalModels {
  preset: string;
  requestedPreset?: string;
  roles: ModelRoleMap;
}

export const RETRIEVAL_MODEL_PRESETS: Record<string, RetrievalModelPreset> = {
  [DEFAULT_RETRIEVAL_PRESET]: {
    name: DEFAULT_RETRIEVAL_PRESET,
    desc: 'Compatibility default: current Codegraph embedding model plus GNO-inspired retrieval roles.',
    roles: {
      embed: MODELS[DEFAULT_MODEL]!.name,
      rerank: 'hf:Qwen/Qwen3-Reranker-0.6B-GGUF',
      expand: 'hf:Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      gen: 'hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    },
  },
  'gno-compact': {
    name: 'gno-compact',
    desc: 'Compact GNO-inspired local retrieval model roles.',
    roles: {
      embed: 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF',
      rerank: 'hf:Qwen/Qwen3-Reranker-0.6B-GGUF',
      expand: 'hf:Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      gen: 'hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    },
  },
  'gno-balanced': {
    name: 'gno-balanced',
    desc: 'Balanced GNO-inspired retrieval model roles.',
    roles: {
      embed: 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF',
      rerank: 'hf:Qwen/Qwen3-Reranker-0.6B-GGUF',
      expand: 'hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF',
      gen: 'hf:Qwen/Qwen2.5-3B-Instruct-GGUF',
    },
  },
  'gno-quality': {
    name: 'gno-quality',
    desc: 'Quality-oriented GNO-inspired retrieval model roles.',
    roles: {
      embed: 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF',
      rerank: 'hf:Qwen/Qwen3-Reranker-0.6B-GGUF',
      expand: 'hf:Qwen/Qwen2.5-3B-Instruct-GGUF',
      gen: 'hf:Qwen/Qwen2.5-7B-Instruct-GGUF',
    },
  },
};
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const BATCH_SIZE_MAP: Record<string, number> = {
  minilm: 32,
  'jina-small': 16,
  'jina-base': 8,
  'jina-code': 8,
  nomic: 8,
  'nomic-v1.5': 8,
  'bge-large': 4,
};
const DEFAULT_BATCH_SIZE = 32;

export function resolveModelKey(modelKeyOrUri?: string): string {
  const requested = modelKeyOrUri || DEFAULT_MODEL;
  if (MODELS[requested]) return requested;
  const entry = Object.entries(MODELS).find(([, config]) => config.name === requested);
  if (entry) return entry[0];
  return requested;
}

/** @internal Used by generator.js — not part of the public barrel. */
export function getModelConfig(modelKey?: string): ModelConfig {
  const key = resolveModelKey(modelKey);
  const config = MODELS[key];
  if (!config) {
    throw new ConfigError(`Unknown model: ${key}. Available: ${Object.keys(MODELS).join(', ')}`);
  }
  return config;
}

function resolveLegacyEmbeddingUri(config?: CodegraphConfig): string | undefined {
  const legacyModel = config?.embeddings?.model;
  if (!legacyModel) return undefined;
  const key = resolveModelKey(legacyModel);
  return MODELS[key]?.name ?? legacyModel;
}

export function resolveRetrievalModels(config?: CodegraphConfig): ResolvedRetrievalModels {
  const requestedPreset = config?.models?.preset || DEFAULT_RETRIEVAL_PRESET;
  const preset =
    RETRIEVAL_MODEL_PRESETS[requestedPreset] ?? RETRIEVAL_MODEL_PRESETS[DEFAULT_RETRIEVAL_PRESET]!;
  const roles: ModelRoleMap = { ...preset.roles };
  const overrides = config?.models?.roles;

  const selectedNonDefaultPreset =
    requestedPreset !== DEFAULT_RETRIEVAL_PRESET && preset.name === requestedPreset;
  const legacyEmbed = selectedNonDefaultPreset ? undefined : resolveLegacyEmbeddingUri(config);
  const hasEmbedOverride = overrides?.embed != null;
  if (legacyEmbed && !hasEmbedOverride) {
    roles.embed = legacyEmbed;
  }

  if (overrides) {
    for (const role of ['embed', 'rerank', 'expand', 'gen'] as const) {
      const uri = overrides[role];
      if (uri) roles[role] = uri;
    }
  }

  return {
    preset: preset.name,
    requestedPreset: requestedPreset === preset.name ? undefined : requestedPreset,
    roles,
  };
}

export function resolveModelRoleUri(config: CodegraphConfig | undefined, role: ModelRole): string {
  return resolveRetrievalModels(config).roles[role];
}

/**
 * Attempt to install a missing package.
 * In TTY environments, prompts the user for confirmation first.
 * In non-TTY environments (CI, piped stdin), installs automatically with a log message.
 * Returns true if the package was installed, false otherwise.
 * @internal Not part of the public barrel.
 */
export function promptInstall(packageName: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    info(`Installing ${packageName} (optional dependency for semantic search)…`);
    try {
      execFileSync(NPM_BIN, ['install', '--no-save', packageName], {
        stdio: 'inherit',
        timeout: 300_000,
      });
      return Promise.resolve(true);
    } catch (err) {
      info(
        `Auto-install of ${packageName} failed (${err instanceof Error ? err.message : String(err)}). Install it manually with:\n  npm install ${packageName}`,
      );
      return Promise.resolve(false);
    }
  }

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(
      `Semantic search requires ${packageName}. Install it now? [y/N] `,
      (answer: string) => {
        rl.close();
        if (answer.trim().toLowerCase() !== 'y') return resolve(false);
        try {
          execFileSync(NPM_BIN, ['install', packageName], {
            stdio: 'inherit',
            timeout: 300_000,
          });
          resolve(true);
        } catch (err) {
          info(
            `Install of ${packageName} failed (${err instanceof Error ? err.message : String(err)}). Install it manually with:\n  npm install ${packageName}`,
          );
          resolve(false);
        }
      },
    );
  });
}

/**
 * Lazy-load @huggingface/transformers.
 * If the package is missing, prompts the user to install it interactively.
 * In non-TTY environments, attempts automatic installation.
 * @internal Not part of the public barrel.
 */
export async function loadTransformers(): Promise<unknown> {
  try {
    return await import('@huggingface/transformers');
  } catch {
    const pkg = '@huggingface/transformers';
    const installed = await promptInstall(pkg);
    if (installed) {
      try {
        return await import(pkg);
      } catch (loadErr) {
        throw new EngineError(
          `${pkg} was installed but failed to load. Please check your environment.`,
          { cause: loadErr instanceof Error ? loadErr : undefined },
        );
      }
    }
    throw new EngineError(`Semantic search requires ${pkg}.\nInstall it with: npm install ${pkg}`);
  }
}

/**
 * Dispose the current ONNX session and free memory.
 * Safe to call when no model is loaded (no-op).
 */
export async function disposeModel(): Promise<void> {
  if (extractor) {
    await extractor.dispose();
    extractor = null;
  }
  activeModel = null;
}

async function loadModel(modelKey?: string): Promise<{ extractor: unknown; config: ModelConfig }> {
  const config = getModelConfig(modelKey);

  if (extractor && activeModel === config.name) return { extractor, config };

  // Dispose previous model before loading a different one
  await disposeModel();

  const transformers = (await loadTransformers()) as { pipeline: unknown };
  pipeline = transformers.pipeline;

  info(`Loading embedding model: ${config.name} (${config.dim}d)...`);
  const pipelineOpts = config.quantized ? { dtype: 'q8' } : {};
  try {
    extractor =
      await // biome-ignore lint/complexity/noBannedTypes: dynamically loaded transformers pipeline is untyped
      (pipeline as Function)('feature-extraction', config.name, pipelineOpts);
  } catch (err: unknown) {
    const cause = err instanceof Error ? err : undefined;
    const msg = cause?.message || String(err);
    if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('gated')) {
      throw new EngineError(
        `Model "${config.name}" requires authentication.\n` +
          `This model is gated on HuggingFace and needs an access token.\n\n` +
          `Options:\n` +
          `  1. Set HF_TOKEN env var: export HF_TOKEN=hf_...\n` +
          `  2. Use a public model instead: codegraph embed --model minilm`,
        { cause },
      );
    }
    throw new EngineError(
      `Failed to load model "${config.name}": ${msg}\n` +
        `Try a different model: codegraph embed --model minilm`,
      { cause },
    );
  }
  activeModel = config.name;
  info('Model loaded.');
  return { extractor, config };
}

/**
 * Generate embeddings for an array of texts.
 */
export async function embed(
  texts: string[],
  modelKey?: string,
): Promise<{ vectors: Float32Array[]; dim: number }> {
  const { extractor: ext, config } = await loadModel(modelKey);
  const dim = config.dim;
  const results: Float32Array[] = [];
  const batchModelKey = resolveModelKey(modelKey);
  const batchSize = BATCH_SIZE_MAP[batchModelKey] ?? DEFAULT_BATCH_SIZE;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const output =
      (await // biome-ignore lint/complexity/noBannedTypes: dynamically loaded extractor is untyped
      (ext as Function)(batch, { pooling: 'mean', normalize: true })) as {
        data: number[];
      };

    for (let j = 0; j < batch.length; j++) {
      const start = j * dim;
      const vec = new Float32Array(dim);
      for (let k = 0; k < dim; k++) {
        vec[k] = output.data[start + k] ?? 0;
      }
      results.push(vec);
    }

    if (texts.length > batchSize) {
      process.stderr.write(`  Embedded ${Math.min(i + batchSize, texts.length)}/${texts.length}\r`);
    }
  }

  return { vectors: results, dim };
}
