/**
 * Embeddings subsystem — public API barrel.
 *
 * Re-exports everything consumers previously imported from `../embedder.js`.
 */

export type { BuildEmbeddingsOptions } from './generator.js';
export { buildEmbeddings, estimateTokens } from './generator.js';
export type {
  ModelConfig,
  ModelRole,
  ModelRoleMap,
  ResolvedRetrievalModels,
  RetrievalModelPreset,
} from './models.js';
export {
  DEFAULT_MODEL,
  DEFAULT_RETRIEVAL_PRESET,
  disposeModel,
  EMBEDDING_STRATEGIES,
  embed,
  MODELS,
  RETRIEVAL_MODEL_PRESETS,
  resolveModelKey,
  resolveModelRoleUri,
  resolveRetrievalModels,
} from './models.js';
export { search } from './search/cli-formatter.js';
export { hybridSearchData } from './search/hybrid.js';
export { ftsSearchData } from './search/keyword.js';
export { multiSearchData, searchData } from './search/semantic.js';
export { cosineSim } from './stores/sqlite-blob.js';
