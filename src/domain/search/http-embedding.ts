import { EngineError } from '../../shared/errors.js';
import type { EmbeddingPort } from './ports.js';

function asError(cause: unknown): Error | undefined {
  return cause instanceof Error
    ? cause
    : cause === undefined
      ? undefined
      : new Error(String(cause));
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: unknown; index?: number }>;
}

export function isHttpModelUri(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

export class HttpEmbeddingPort implements EmbeddingPort {
  private readonly apiUrl: string;
  private readonly modelName: string;

  constructor(private readonly modelUri: string) {
    const hashIndex = modelUri.indexOf('#');
    if (hashIndex > 0) {
      this.apiUrl = modelUri.slice(0, hashIndex);
      this.modelName = modelUri.slice(hashIndex + 1);
    } else {
      this.apiUrl = modelUri;
      const url = new URL(modelUri);
      this.modelName = url.pathname.split('/').filter(Boolean).at(-1) || 'embedding-model';
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: texts, model: this.modelName }),
      });
    } catch (cause) {
      throw new EngineError(`Embedding HTTP request failed for ${this.modelUri}.`, {
        cause: asError(cause),
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new EngineError(
        `Embedding HTTP endpoint ${this.apiUrl} returned HTTP ${response.status}${body ? `: ${body}` : ''}`,
      );
    }

    const payload = (await response.json()) as OpenAIEmbeddingResponse;
    const data = payload.data;
    if (!Array.isArray(data)) {
      throw new EngineError('Embedding HTTP response is invalid: missing data array.');
    }
    const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (sorted.length !== texts.length) {
      throw new EngineError(
        `Embedding HTTP response returned ${sorted.length} vector(s) for ${texts.length} input(s).`,
      );
    }
    return sorted.map((item, index) => {
      if (!Array.isArray(item.embedding)) {
        throw new EngineError(
          `Embedding HTTP response is invalid: missing embedding at index ${index}.`,
        );
      }
      return new Float32Array(item.embedding as number[]);
    });
  }
}
