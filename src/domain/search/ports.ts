import { CodegraphError } from '../../shared/errors.js';

export interface EmbeddingPort {
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  reset?(): Promise<void> | void;
}

export interface EmbeddingRecoveryOptions {
  batchSize?: number;
  sampleErrors?: number;
}

interface ItemFailure {
  index: number;
  text: string;
  error: unknown;
}

const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_SAMPLE_ERRORS = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resetPort(port: EmbeddingPort): Promise<void> {
  if (port.reset) await port.reset();
}

async function embedRange(
  port: EmbeddingPort,
  texts: string[],
  offset: number,
  failures: ItemFailure[],
): Promise<Array<Float32Array | undefined>> {
  try {
    const vectors = await port.embedBatch(texts);
    if (vectors.length !== texts.length) {
      throw new Error(
        `Embedding port returned ${vectors.length} vector(s) for ${texts.length} text(s)`,
      );
    }
    return vectors;
  } catch (error) {
    if (error instanceof CodegraphError) {
      throw error;
    }

    if (texts.length === 1) {
      failures.push({ index: offset, text: texts[0] ?? '', error });
      return [undefined];
    }

    await resetPort(port);
    const midpoint = Math.ceil(texts.length / 2);
    const left = await embedRange(port, texts.slice(0, midpoint), offset, failures);
    const right = await embedRange(port, texts.slice(midpoint), offset + midpoint, failures);
    return [...left, ...right];
  }
}

function failureSummary(failures: ItemFailure[], sampleErrors: number): string {
  return failures
    .slice(0, sampleErrors)
    .map((failure) => {
      const preview = failure.text.replace(/\s+/g, ' ').slice(0, 80);
      return `#${failure.index}: ${errorMessage(failure.error)}${preview ? ` (${preview})` : ''}`;
    })
    .join('; ');
}

export async function embedWithRecovery(
  port: EmbeddingPort,
  texts: string[],
  options: EmbeddingRecoveryOptions = {},
): Promise<Float32Array[]> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const sampleErrors = options.sampleErrors ?? DEFAULT_SAMPLE_ERRORS;
  const vectors: Array<Float32Array | undefined> = [];
  const failures: ItemFailure[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    vectors.push(...(await embedRange(port, batch, i, failures)));
  }

  if (failures.length > 0) {
    throw new Error(
      `Failed to embed ${failures.length} of ${texts.length} item(s). Sample errors: ${failureSummary(
        failures,
        sampleErrors,
      )}`,
    );
  }

  return vectors as Float32Array[];
}
