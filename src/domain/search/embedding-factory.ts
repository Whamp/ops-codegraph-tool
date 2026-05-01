import { EngineError } from '../../shared/errors.js';
import { type EmbeddingInputType, formatEmbeddingText } from './compatibility.js';
import { HttpEmbeddingPort, isHttpModelUri } from './http-embedding.js';
import {
  type DownloadPolicy,
  isGgufModelUri,
  ModelCache,
  resolveDownloadPolicy,
} from './model-cache.js';
import { createTransformerEmbeddingPort, MODELS, resolveModelKey } from './models.js';
import type { EmbeddingPort } from './ports.js';

export interface EmbeddingPortFactoryOptions {
  inputType?: EmbeddingInputType | 'raw';
  cache?: ModelCache;
  cacheDir?: string;
  policy?: DownloadPolicy;
  runtimeLoader?: () => Promise<unknown>;
}

class FormattingEmbeddingPort implements EmbeddingPort {
  private readonly inner: EmbeddingPort;
  private readonly modelUri: string | undefined;
  private readonly inputType: EmbeddingInputType;

  constructor(inner: EmbeddingPort, modelUri: string | undefined, inputType: EmbeddingInputType) {
    this.inner = inner;
    this.modelUri = modelUri;
    this.inputType = inputType;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return this.inner.embedBatch(
      texts.map((text) => formatEmbeddingText(text, this.modelUri, this.inputType)),
    );
  }

  reset(): Promise<void> | void {
    return this.inner.reset?.();
  }
}

type LlamaEmbeddingContext = {
  getEmbeddingFor(text: string): Promise<{ vector: Iterable<number> }>;
};
type LlamaEmbeddingModel = {
  trainContextSize?: number;
  tokenize?: (text: string) => readonly unknown[];
  detokenize?: (tokens: readonly unknown[]) => string;
  createEmbeddingContext(): Promise<LlamaEmbeddingContext>;
  dispose?: () => Promise<void> | void;
};

function asError(cause: unknown): Error | undefined {
  return cause instanceof Error
    ? cause
    : cause === undefined
      ? undefined
      : new Error(String(cause));
}

async function importOptionalRuntime(specifier: string): Promise<unknown> {
  return (
    new Function('specifier', 'return import(specifier)') as (value: string) => Promise<unknown>
  )(specifier);
}

class NodeLlamaCppEmbeddingPort implements EmbeddingPort {
  private readonly runtimeLoader: () => Promise<unknown>;
  private readonly modelPath: string;
  private readonly modelUri: string;
  private context: LlamaEmbeddingContext | undefined;
  private model: LlamaEmbeddingModel | undefined;

  constructor(runtimeLoader: () => Promise<unknown>, modelPath: string, modelUri: string) {
    this.runtimeLoader = runtimeLoader;
    this.modelPath = modelPath;
    this.modelUri = modelUri;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const context = await this.getContext();
    const vectors: Float32Array[] = [];
    for (const text of texts) {
      const embedding = await context.getEmbeddingFor(this.clampToModelContext(text));
      vectors.push(new Float32Array(Array.from(embedding.vector)));
    }
    return vectors;
  }

  async reset(): Promise<void> {
    await this.model?.dispose?.();
    this.model = undefined;
    this.context = undefined;
  }

  private clampToModelContext(text: string): string {
    const model = this.model;
    const rawLimit = model?.trainContextSize;
    const tokenize = model?.tokenize;
    const detokenize = model?.detokenize;
    if (
      typeof rawLimit !== 'number' ||
      !Number.isFinite(rawLimit) ||
      rawLimit <= 0 ||
      !tokenize ||
      !detokenize
    ) {
      return text;
    }

    const limit = Math.max(1, Math.floor(rawLimit) - 4);
    const tokens = tokenize(text);
    if (tokens.length <= limit) return text;
    return detokenize(tokens.slice(0, limit));
  }

  private async getContext(): Promise<{
    getEmbeddingFor(text: string): Promise<{ vector: Iterable<number> }>;
  }> {
    if (this.context) return this.context;
    let runtime: unknown;
    try {
      runtime = await this.runtimeLoader();
    } catch (cause) {
      throw new EngineError(
        'Qwen/GGUF embeddings require the bundled node-llama-cpp runtime. Reinstall Codegraph or inspect the package manager/native build error.',
        { cause: asError(cause) },
      );
    }
    const mod = runtime as {
      getLlama?: () => Promise<{
        loadModel(args: { modelPath: string }): Promise<LlamaEmbeddingModel>;
      }>;
    };
    if (!mod.getLlama) throw new EngineError('node-llama-cpp runtime is missing getLlama().');
    const llama = await mod.getLlama();
    this.model = await llama.loadModel({ modelPath: this.modelPath });
    this.context = await this.model.createEmbeddingContext();
    if (!this.context?.getEmbeddingFor) {
      throw new EngineError(
        `node-llama-cpp could not create an embedding context for ${this.modelUri}.`,
      );
    }
    return this.context;
  }
}

function isTransformerModel(modelUri: string): boolean {
  const key = resolveModelKey(modelUri);
  return MODELS[key] != null;
}

export async function createEmbeddingPort(
  modelUri: string,
  options: EmbeddingPortFactoryOptions = {},
): Promise<EmbeddingPort> {
  const inputType = options.inputType ?? 'document';
  let port: EmbeddingPort;

  if (isHttpModelUri(modelUri)) {
    port = new HttpEmbeddingPort(modelUri);
  } else if (isTransformerModel(modelUri)) {
    port = createTransformerEmbeddingPort(modelUri);
  } else if (isGgufModelUri(modelUri)) {
    const cache = options.cache ?? new ModelCache(options.cacheDir);
    const modelPath = await cache.ensureModel(
      modelUri,
      'embed',
      options.policy ?? resolveDownloadPolicy(),
    );
    port = new NodeLlamaCppEmbeddingPort(
      options.runtimeLoader ?? (() => importOptionalRuntime('node-llama-cpp')),
      modelPath,
      modelUri,
    );
  } else {
    throw new EngineError(
      `Unsupported embedding model "${modelUri}". Use a Codegraph transformer model, an OpenAI-compatible http(s) endpoint, hf: URI, or file: URI.`,
    );
  }

  return inputType === 'raw' ? port : new FormattingEmbeddingPort(port, modelUri, inputType);
}

export async function embedTexts(
  texts: string[],
  modelUri: string,
  inputType: EmbeddingInputType,
): Promise<{ vectors: Float32Array[]; dim: number }> {
  const port = await createEmbeddingPort(modelUri, { inputType });
  const vectors = await port.embedBatch(texts);
  return { vectors, dim: vectors[0]?.length ?? 0 };
}
