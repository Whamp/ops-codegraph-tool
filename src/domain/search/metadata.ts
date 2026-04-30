import { getBuildMeta } from '../../db/index.js';
import { getEmbeddingMeta } from '../../db/repository/embeddings.js';
import { warn } from '../../infrastructure/logger.js';
import type { BetterSqlite3Database } from '../../types.js';
import { getEmbeddingCompatibilityProfile } from './compatibility.js';

export const EMBEDDING_FORMATTER_VERSION = 'codegraph-symbol-text-v1';

export interface EmbeddingMetadata {
  modelUri?: string;
  dimension?: number;
  strategy?: string;
  compatibilityProfile?: string;
  formatterVersion?: string;
  builtAt?: string;
  graphBuiltAt?: string;
  isLegacy: boolean;
}

export interface ActiveEmbeddingMetadata {
  modelUri: string;
  dimension?: number;
  strategy?: string;
  compatibilityProfile: string;
  formatterVersion: string;
}

export interface EmbeddingMetadataEntry {
  key: string;
  value: string;
}

function parseDimension(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readEmbeddingMetadata(db: BetterSqlite3Database): EmbeddingMetadata {
  const modelUri = getEmbeddingMeta(db, 'model_uri') || getEmbeddingMeta(db, 'model');
  const dimension = parseDimension(
    getEmbeddingMeta(db, 'dimension') || getEmbeddingMeta(db, 'dim'),
  );
  const strategy = getEmbeddingMeta(db, 'strategy');
  const compatibilityProfile = getEmbeddingMeta(db, 'compatibility_profile');
  const formatterVersion = getEmbeddingMeta(db, 'formatter_version');
  const builtAt = getEmbeddingMeta(db, 'build_timestamp') || getEmbeddingMeta(db, 'built_at');
  const graphBuiltAt = getBuildMeta(db, 'built_at') ?? undefined;

  return {
    modelUri,
    dimension,
    strategy,
    compatibilityProfile,
    formatterVersion,
    builtAt,
    graphBuiltAt,
    isLegacy: !getEmbeddingMeta(db, 'model_uri') || !compatibilityProfile || !formatterVersion,
  };
}

export function createEmbeddingMetadataEntries(args: {
  modelUri: string;
  dimension: number;
  strategy: string;
  builtAt?: string;
}): EmbeddingMetadataEntry[] {
  const builtAt = args.builtAt ?? new Date().toISOString();
  const compatibilityProfile = getEmbeddingCompatibilityProfile(args.modelUri).id;
  return [
    // Legacy keys kept for migration compatibility.
    { key: 'model', value: args.modelUri },
    { key: 'dim', value: String(args.dimension) },
    { key: 'strategy', value: args.strategy },
    { key: 'built_at', value: builtAt },
    // Model-aware keys.
    { key: 'model_uri', value: args.modelUri },
    { key: 'dimension', value: String(args.dimension) },
    { key: 'compatibility_profile', value: compatibilityProfile },
    { key: 'formatter_version', value: EMBEDDING_FORMATTER_VERSION },
    { key: 'build_timestamp', value: builtAt },
  ];
}

export function expectedEmbeddingMetadata(args: {
  modelUri: string;
  dimension?: number;
  strategy?: string;
}): ActiveEmbeddingMetadata {
  return {
    modelUri: args.modelUri,
    dimension: args.dimension,
    strategy: args.strategy,
    compatibilityProfile: getEmbeddingCompatibilityProfile(args.modelUri).id,
    formatterVersion: EMBEDDING_FORMATTER_VERSION,
  };
}

export function diagnoseEmbeddingMetadata(
  stored: EmbeddingMetadata,
  active: ActiveEmbeddingMetadata,
): string[] {
  const diagnostics: string[] = [];

  if (stored.modelUri && stored.modelUri !== active.modelUri) {
    diagnostics.push(`model URI is ${stored.modelUri}, active model URI is ${active.modelUri}`);
  }
  if (stored.dimension && active.dimension && stored.dimension !== active.dimension) {
    diagnostics.push(`dimension is ${stored.dimension}, active dimension is ${active.dimension}`);
  }
  if (stored.strategy && active.strategy && stored.strategy !== active.strategy) {
    diagnostics.push(`strategy is ${stored.strategy}, active strategy is ${active.strategy}`);
  }
  if (stored.compatibilityProfile && stored.compatibilityProfile !== active.compatibilityProfile) {
    diagnostics.push(
      `compatibility profile is ${stored.compatibilityProfile}, active profile is ${active.compatibilityProfile}`,
    );
  }
  if (stored.formatterVersion && stored.formatterVersion !== active.formatterVersion) {
    diagnostics.push(
      `formatter version is ${stored.formatterVersion}, active formatter version is ${active.formatterVersion}`,
    );
  }

  const embeddingBuiltAt = parseTimestamp(stored.builtAt);
  const graphBuiltAt = parseTimestamp(stored.graphBuiltAt);
  if (
    embeddingBuiltAt !== undefined &&
    graphBuiltAt !== undefined &&
    embeddingBuiltAt < graphBuiltAt
  ) {
    diagnostics.push(
      `embedding build timestamp ${stored.builtAt} is older than graph build timestamp ${stored.graphBuiltAt}`,
    );
  }

  return diagnostics;
}

export function warnIfEmbeddingMetadataStale(
  stored: EmbeddingMetadata,
  active: ActiveEmbeddingMetadata,
  options: { modelHint?: string; command?: 'search' | 'embed' } = {},
): string[] {
  const diagnostics = diagnoseEmbeddingMetadata(stored, active);
  if (diagnostics.length === 0) return diagnostics;

  const modelHint = options.modelHint ?? active.modelUri;
  const strategyHint = active.strategy ? ` --strategy ${active.strategy}` : '';
  warn(
    `Stored embeddings may be stale or incompatible: ${diagnostics.join('; ')}. ` +
      `Re-run \`codegraph embed --model ${modelHint}${strategyHint}\` with the active model/strategy/profile.`,
  );
  return diagnostics;
}
