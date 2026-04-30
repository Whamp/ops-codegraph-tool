/**
 * Embeddings subsystem — public API barrel.
 *
 * Re-exports everything consumers previously imported from `../embedder.js`.
 */

export {
  formatEmbeddingDocument,
  formatEmbeddingQuery,
  getEmbeddingCompatibilityProfile,
} from './compatibility.js';
export { createEmbeddingPort, embedTexts } from './embedding-factory.js';
export type { BuildEmbeddingsOptions } from './generator.js';
export { buildEmbeddings, estimateTokens } from './generator.js';
export { HttpEmbeddingPort, isHttpModelUri } from './http-embedding.js';
export type { ActiveEmbeddingMetadata, EmbeddingMetadata } from './metadata.js';
export {
  createEmbeddingMetadataEntries,
  diagnoseEmbeddingMetadata,
  EMBEDDING_FORMATTER_VERSION,
  expectedEmbeddingMetadata,
  readEmbeddingMetadata,
  warnIfEmbeddingMetadataStale,
} from './metadata.js';
export type { DownloadPolicy, ParsedModelUri } from './model-cache.js';
export {
  isGgufModelUri,
  ModelCache,
  parseModelUri,
  resolveDownloadPolicy,
  validateGgufFile,
} from './model-cache.js';
export type {
  ModelConfig,
  ModelRole,
  ModelRoleMap,
  ResolvedRetrievalModels,
  RetrievalModelPreset,
} from './models.js';
export {
  createTransformerEmbeddingPort,
  DEFAULT_MODEL,
  DEFAULT_RETRIEVAL_PRESET,
  disposeModel,
  EMBEDDING_STRATEGIES,
  embed,
  getEmbeddingBatchSize,
  MODELS,
  RETRIEVAL_MODEL_PRESETS,
  resolveModelKey,
  resolveModelRoleUri,
  resolveRetrievalModels,
} from './models.js';
export type { EmbeddingPort, EmbeddingRecoveryOptions } from './ports.js';
export { embedWithRecovery } from './ports.js';
export { search } from './search/cli-formatter.js';
export type { ExpansionProvider, ExpansionResult } from './search/expansion.js';
export {
  applyExpansionGuardrails,
  buildExpansionPrompt,
  expandOrFallback,
  parseExpansionOutput,
  routeExpandedQueries,
} from './search/expansion.js';
export { hybridSearchData } from './search/hybrid.js';
export { ftsSearchData } from './search/keyword.js';
export { multiSearchData, searchData } from './search/semantic.js';
export { cosineSim } from './stores/sqlite-blob.js';
export type {
  VectorAccelerationDriver,
  VectorIndex,
  VectorRow,
  VectorSearchResult,
} from './vector-index.js';
export {
  createVectorIndex,
  decodeEmbedding,
  encodeEmbedding,
  setVectorAccelerationDriverForTests,
  vectorStorageKey,
  vectorTableName,
} from './vector-index.js';
