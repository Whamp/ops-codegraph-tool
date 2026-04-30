export type EmbeddingInputType = 'query' | 'document';
export type EmbeddingQueryFormat = 'raw-text' | 'qwen-instruct';
export type EmbeddingDocumentFormat = 'raw-text';

export interface EmbeddingCompatibilityProfile {
  id: string;
  queryFormat: EmbeddingQueryFormat;
  documentFormat: EmbeddingDocumentFormat;
}

const DEFAULT_PROFILE: EmbeddingCompatibilityProfile = {
  id: 'default',
  queryFormat: 'raw-text',
  documentFormat: 'raw-text',
};

const QWEN_PROFILE: EmbeddingCompatibilityProfile = {
  id: 'qwen-embedding',
  queryFormat: 'qwen-instruct',
  documentFormat: 'raw-text',
};

function hasAllTerms(value: string, terms: string[]): boolean {
  return terms.every((term) => value.includes(term));
}

export function getEmbeddingCompatibilityProfile(modelUri?: string): EmbeddingCompatibilityProfile {
  const normalized = modelUri?.toLowerCase() ?? '';
  if (hasAllTerms(normalized, ['qwen', 'embed'])) return QWEN_PROFILE;
  return DEFAULT_PROFILE;
}

export function formatEmbeddingQuery(query: string, modelUri?: string): string {
  const profile = getEmbeddingCompatibilityProfile(modelUri);
  if (profile.queryFormat === 'qwen-instruct') {
    return `Instruct: Given a code search query, retrieve relevant code symbols and implementation details.\nQuery: ${query}`;
  }
  return query;
}

export function formatEmbeddingDocument(text: string, _modelUri?: string): string {
  return text;
}

export function formatEmbeddingText(
  text: string,
  modelUri: string | undefined,
  inputType: EmbeddingInputType,
): string {
  return inputType === 'query'
    ? formatEmbeddingQuery(text, modelUri)
    : formatEmbeddingDocument(text, modelUri);
}
