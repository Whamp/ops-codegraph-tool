#!/usr/bin/env node

/**
 * Code retrieval benchmark harness for comparing legacy transformer models with
 * the GNO/Qwen-style embedding preset path.
 *
 * Default mode is a deterministic mock smoke run: it does not import model
 * runtimes, download weights, or require cloud services. Pass --mode real to
 * embed the bundled fixtures with local models you have installed/cached.
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type RetrievalFixtureCategory =
  | 'code-intent'
  | 'identifier'
  | 'graph-aware-symbol-context'
  | 'ambiguous-natural-language';

export interface RetrievalDocument {
  id: string;
  symbol: string;
  file: string;
  kind: string;
  text: string;
}

export interface RetrievalFixture {
  id: string;
  category: RetrievalFixtureCategory;
  query: string;
  description: string;
  relevantSymbolIds: string[];
  documents: RetrievalDocument[];
}

export interface BenchmarkModelPreset {
  id: string;
  label: string;
  modelUri: string;
  rolePreset?: string;
  notes: string;
}

export interface QueryResult {
  fixtureId: string;
  category: RetrievalFixtureCategory;
  query: string;
  expected: string[];
  retrieved: string[];
  rank: number | null;
  reciprocalRank: number;
  searchMs: number;
}

export interface ModelBenchmarkResult {
  label: string;
  modelUri: string;
  rolePreset?: string;
  quality: {
    hitAt1: number;
    hitAt3: number;
    hitAt5: number;
    mrr: number;
    queries: number;
  };
  runtime: {
    embedMs: number;
    searchMs: number;
    totalMs: number;
  };
  embeddingCost: {
    provider: 'local';
    documents: number;
    queries: number;
    cloudCostUsd: 0;
  };
  perQuery: QueryResult[];
}

export interface RetrievalBenchmarkOutput {
  benchmark: 'code-retrieval-model-comparison';
  date: string;
  mode: 'mock' | 'real';
  topK: number;
  fixtures: string[];
  queries: Array<Pick<RetrievalFixture, 'id' | 'category' | 'query' | 'relevantSymbolIds'>>;
  models: Record<string, ModelBenchmarkResult>;
  reproducibility: {
    noCloudServicesRequired: true;
    downloadsDefault: 'disabled-in-mock-mode';
    realModeNote: string;
  };
}

export interface RunRetrievalBenchmarkOptions {
  mode?: 'mock' | 'real';
  topK?: number;
  models?: string[];
  allowDownloads?: boolean;
}

const DEFAULT_MODEL = 'nomic-v1.5';
const CURRENT_DEFAULT_MODEL_URI = 'nomic-ai/nomic-embed-text-v1.5';
const MINILM_MODEL_URI = 'Xenova/all-MiniLM-L6-v2';
const JINA_CODE_MODEL_URI = 'Xenova/jina-embeddings-v2-base-code';
const GNO_COMPACT_PRESET = 'gno-compact';
const GNO_QWEN_EMBED_URI = 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf';

export const BENCHMARK_MODEL_PRESETS: BenchmarkModelPreset[] = [
  {
    id: 'current-default',
    label: `Current default (${DEFAULT_MODEL})`,
    modelUri: CURRENT_DEFAULT_MODEL_URI,
    notes: 'Compatibility baseline used by Codegraph today; issue #13 decides whether this changes.',
  },
  {
    id: 'minilm-baseline',
    label: 'Fast legacy baseline (minilm)',
    modelUri: MINILM_MODEL_URI,
    notes: 'Small notable alternative that is cheap to run locally.',
  },
  {
    id: 'jina-code',
    label: 'Code-aware legacy alternative (jina-code)',
    modelUri: JINA_CODE_MODEL_URI,
    notes: 'Existing code-focused transformer option.',
  },
  {
    id: 'gno-qwen-compact',
    label: 'GNO/Qwen compact preset embed role',
    modelUri: GNO_QWEN_EMBED_URI,
    rolePreset: GNO_COMPACT_PRESET,
    notes: 'Qwen GGUF embedding path from the GNO-inspired preset registry.',
  },
];

export const CODE_RETRIEVAL_FIXTURES: RetrievalFixture[] = [
  {
    id: 'intent-resilient-batch',
    category: 'code-intent',
    query: 'recover embedding batches by retrying smaller chunks after one item fails',
    description: 'Natural-language intent search for resilient embedding behavior.',
    relevantSymbolIds: ['embedWithRecovery'],
    documents: [
      {
        id: 'embedWithRecovery',
        symbol: 'embedWithRecovery',
        file: 'src/domain/search/ports.ts',
        kind: 'function',
        text: 'function embedWithRecovery retries a failed embedding batch by splitting it into smaller chunks, falling back to single-item recovery, and preserving successful vectors.',
      },
      {
        id: 'buildExpansionPrompt',
        symbol: 'buildExpansionPrompt',
        file: 'src/domain/search/search/expansion.ts',
        kind: 'function',
        text: 'function buildExpansionPrompt asks a local model for lexical variants, semantic intent variants, and one HyDE passage for search expansion.',
      },
      {
        id: 'vectorStorageKey',
        symbol: 'vectorStorageKey',
        file: 'src/domain/search/vector-index.ts',
        kind: 'function',
        text: 'function vectorStorageKey creates a model-isolated key for vector tables so embeddings from different models do not collide.',
      },
    ],
  },
  {
    id: 'identifier-default-model',
    category: 'identifier',
    query: 'DEFAULT_RETRIEVAL_PRESET',
    description: 'Exact identifier lookup should reward lexical/symbol matches.',
    relevantSymbolIds: ['DEFAULT_RETRIEVAL_PRESET'],
    documents: [
      {
        id: 'DEFAULT_RETRIEVAL_PRESET',
        symbol: 'DEFAULT_RETRIEVAL_PRESET',
        file: 'src/domain/search/models.ts',
        kind: 'constant',
        text: 'export const DEFAULT_RETRIEVAL_PRESET names the compatibility default retrieval model preset and keeps the current embedding model until benchmark evidence supports a change.',
      },
      {
        id: 'DEFAULT_MODEL',
        symbol: 'DEFAULT_MODEL',
        file: 'src/domain/search/models.ts',
        kind: 'constant',
        text: 'export const DEFAULT_MODEL is the legacy default embedding model key used by Codegraph semantic search.',
      },
      {
        id: 'resolveRetrievalModels',
        symbol: 'resolveRetrievalModels',
        file: 'src/domain/search/models.ts',
        kind: 'function',
        text: 'function resolveRetrievalModels combines preset roles, role overrides, and legacy embedding model compatibility.',
      },
    ],
  },
  {
    id: 'graph-aware-symbol-context',
    category: 'graph-aware-symbol-context',
    query: 'find symbol text that keeps callers imports and surrounding class context for embeddings',
    description: 'Retrieval should benefit from graph-aware symbol context instead of raw names only.',
    relevantSymbolIds: ['generateStructuredText'],
    documents: [
      {
        id: 'generateStructuredText',
        symbol: 'generateStructuredText',
        file: 'src/domain/search/generator.ts',
        kind: 'function',
        text: 'function generateStructuredText builds graph-aware symbol text with file path, kind, signature, imports, callers, callees, and class or module context before embedding.',
      },
      {
        id: 'formatEmbeddingQuery',
        symbol: 'formatEmbeddingQuery',
        file: 'src/domain/search/compatibility.ts',
        kind: 'function',
        text: 'function formatEmbeddingQuery applies compatibility-specific query instructions for asymmetric embedding models such as Qwen.',
      },
      {
        id: 'hybridSearchData',
        symbol: 'hybridSearchData',
        file: 'src/domain/search/search/hybrid.ts',
        kind: 'function',
        text: 'function hybridSearchData fuses BM25 lexical results, vector retrieval results, optional expansion variants, and optional reranking metadata.',
      },
    ],
  },
  {
    id: 'ambiguous-cache-policy',
    category: 'ambiguous-natural-language',
    query: 'do not surprise me by fetching things when I search offline',
    description: 'Ambiguous user wording should find offline/download policy controls rather than generic search code.',
    relevantSymbolIds: ['resolveDownloadPolicy'],
    documents: [
      {
        id: 'resolveDownloadPolicy',
        symbol: 'resolveDownloadPolicy',
        file: 'src/domain/search/model-cache.ts',
        kind: 'function',
        text: 'function resolveDownloadPolicy turns CODEGRAPH_OFFLINE HF_HUB_OFFLINE CODEGRAPH_NO_AUTO_DOWNLOAD and explicit flags into offline and allowDownload controls for local model cache resolution.',
      },
      {
        id: 'searchData',
        symbol: 'searchData',
        file: 'src/domain/search/search/semantic.ts',
        kind: 'function',
        text: 'function searchData searches an existing vector table and returns semantic search results for a query.',
      },
      {
        id: 'promptInstall',
        symbol: 'promptInstall',
        file: 'src/domain/search/models.ts',
        kind: 'function',
        text: 'function promptInstall asks an interactive user whether to install an optional semantic search dependency.',
      },
    ],
  },
];

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 1);
}

function keywordScore(query: string, doc: RetrievalDocument, preset: BenchmarkModelPreset): number {
  const queryTokens = tokenize(query);
  const textTokens = new Set(tokenize(`${doc.symbol} ${doc.file} ${doc.kind} ${doc.text}`));
  const symbolTokens = new Set(tokenize(doc.symbol));
  let score = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) score += 1;
    if (symbolTokens.has(token)) score += 1.5;
  }
  if (doc.symbol.toLowerCase() === query.toLowerCase()) score += 10;
  if (preset.id === 'jina-code' && /code|symbol|function|identifier|embedding/.test(query)) score += 0.2;
  if (preset.id === 'gno-qwen-compact' && /intent|context|offline|surprise|recover|smaller/.test(query)) {
    score += doc.text.includes('function') ? 0.5 : 0;
  }
  if (preset.id === 'minilm-baseline') score *= 0.95;
  return score;
}

function cosine(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}

function rankFromScored(scored: Array<{ id: string; score: number }>, expected: string[]): number | null {
  const ordered = scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const index = ordered.findIndex((item) => expected.includes(item.id));
  return index === -1 ? null : index + 1;
}

async function runMockModel(
  preset: BenchmarkModelPreset,
  topK: number,
): Promise<ModelBenchmarkResult> {
  const start = performance.now();
  const perQuery: QueryResult[] = [];
  let searchMs = 0;

  for (const fixture of CODE_RETRIEVAL_FIXTURES) {
    const queryStart = performance.now();
    const scored = fixture.documents.map((doc) => ({
      id: doc.id,
      score: keywordScore(fixture.query, doc, preset),
    }));
    const ordered = scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const elapsed = performance.now() - queryStart;
    searchMs += elapsed;
    const rank = rankFromScored([...ordered], fixture.relevantSymbolIds);
    perQuery.push({
      fixtureId: fixture.id,
      category: fixture.category,
      query: fixture.query,
      expected: fixture.relevantSymbolIds,
      retrieved: ordered.slice(0, topK).map((item) => item.id),
      rank,
      reciprocalRank: rank ? 1 / rank : 0,
      searchMs: Math.round(elapsed * 100) / 100,
    });
  }

  return summarizeModelResult(preset, perQuery, 0, searchMs, performance.now() - start);
}

async function loadBuiltSearchModule(): Promise<{
  createEmbeddingPort: (modelUri: string, options: Record<string, unknown>) => Promise<{
    embedBatch(texts: string[]): Promise<Float32Array[]>;
    reset?: () => Promise<void> | void;
  }>;
}> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const builtSearch = path.join(root, 'dist', 'domain', 'search', 'index.js');
  if (!fs.existsSync(builtSearch)) {
    throw new Error(
      'Real retrieval benchmarks require compiled sources. Run `npm run build` first, or use the default --mock smoke mode.',
    );
  }
  return import(pathToFileURL(builtSearch).href) as Promise<{
    createEmbeddingPort: (modelUri: string, options: Record<string, unknown>) => Promise<{
      embedBatch(texts: string[]): Promise<Float32Array[]>;
      reset?: () => Promise<void> | void;
    }>;
  }>;
}

async function runRealModel(
  preset: BenchmarkModelPreset,
  topK: number,
  allowDownloads: boolean,
): Promise<ModelBenchmarkResult> {
  const totalStart = performance.now();
  const { createEmbeddingPort } = await loadBuiltSearchModule();
  const documentPort = await createEmbeddingPort(preset.modelUri, {
    inputType: 'document',
    policy: { offline: !allowDownloads, allowDownload: allowDownloads },
  });
  const queryPort = await createEmbeddingPort(preset.modelUri, {
    inputType: 'query',
    policy: { offline: !allowDownloads, allowDownload: allowDownloads },
  });

  const perQuery: QueryResult[] = [];
  let embedMs = 0;
  let searchMs = 0;

  for (const fixture of CODE_RETRIEVAL_FIXTURES) {
    const embedStart = performance.now();
    const docVectors = await documentPort.embedBatch(fixture.documents.map((doc) => doc.text));
    const [queryVector] = await queryPort.embedBatch([fixture.query]);
    embedMs += performance.now() - embedStart;

    const queryStart = performance.now();
    const scored = fixture.documents.map((doc, index) => ({
      id: doc.id,
      score: queryVector ? cosine(queryVector, docVectors[index] ?? new Float32Array()) : 0,
    }));
    const ordered = scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const elapsed = performance.now() - queryStart;
    searchMs += elapsed;
    const rank = rankFromScored([...ordered], fixture.relevantSymbolIds);
    perQuery.push({
      fixtureId: fixture.id,
      category: fixture.category,
      query: fixture.query,
      expected: fixture.relevantSymbolIds,
      retrieved: ordered.slice(0, topK).map((item) => item.id),
      rank,
      reciprocalRank: rank ? 1 / rank : 0,
      searchMs: Math.round(elapsed * 100) / 100,
    });
  }

  await documentPort.reset?.();
  await queryPort.reset?.();
  return summarizeModelResult(preset, perQuery, embedMs, searchMs, performance.now() - totalStart);
}

function summarizeModelResult(
  preset: BenchmarkModelPreset,
  perQuery: QueryResult[],
  embedMs: number,
  searchMs: number,
  totalMs: number,
): ModelBenchmarkResult {
  const queries = perQuery.length;
  return {
    label: preset.label,
    modelUri: preset.modelUri,
    rolePreset: preset.rolePreset,
    quality: {
      hitAt1: perQuery.filter((item) => item.rank === 1).length / queries,
      hitAt3: perQuery.filter((item) => item.rank != null && item.rank <= 3).length / queries,
      hitAt5: perQuery.filter((item) => item.rank != null && item.rank <= 5).length / queries,
      mrr: perQuery.reduce((sum, item) => sum + item.reciprocalRank, 0) / queries,
      queries,
    },
    runtime: {
      embedMs: Math.round(embedMs),
      searchMs: Math.round(searchMs),
      totalMs: Math.round(totalMs),
    },
    embeddingCost: {
      provider: 'local',
      documents: CODE_RETRIEVAL_FIXTURES.reduce((sum, fixture) => sum + fixture.documents.length, 0),
      queries,
      cloudCostUsd: 0,
    },
    perQuery,
  };
}

export async function runRetrievalBenchmark(
  options: RunRetrievalBenchmarkOptions = {},
): Promise<RetrievalBenchmarkOutput> {
  const mode = options.mode ?? 'mock';
  const topK = options.topK ?? 5;
  const selected = options.models?.length
    ? BENCHMARK_MODEL_PRESETS.filter((preset) => options.models?.includes(preset.id))
    : BENCHMARK_MODEL_PRESETS;
  const models: Record<string, ModelBenchmarkResult> = {};

  for (const preset of selected) {
    models[preset.id] =
      mode === 'mock'
        ? await runMockModel(preset, topK)
        : await runRealModel(preset, topK, options.allowDownloads ?? false);
  }

  return {
    benchmark: 'code-retrieval-model-comparison',
    date: new Date().toISOString().slice(0, 10),
    mode,
    topK,
    fixtures: CODE_RETRIEVAL_FIXTURES.map((fixture) => fixture.id),
    queries: CODE_RETRIEVAL_FIXTURES.map(({ id, category, query, relevantSymbolIds }) => ({
      id,
      category,
      query,
      relevantSymbolIds,
    })),
    models,
    reproducibility: {
      noCloudServicesRequired: true,
      downloadsDefault: 'disabled-in-mock-mode',
      realModeNote:
        'Real mode uses local transformer/GGUF runtimes. --allow-downloads only controls Codegraph GGUF hf: cache downloads; transformer lanes may use the Hugging Face cache/network according to @huggingface/transformers environment settings. The Qwen GGUF lane creates separate document/query embedding ports for asymmetric input formatting, so plan memory accordingly.',
    },
  };
}

function parseArgs(argv: string[]): RunRetrievalBenchmarkOptions {
  const options: RunRetrievalBenchmarkOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') options.mode = argv[++i] as 'mock' | 'real';
    else if (arg === '--real') options.mode = 'real';
    else if (arg === '--mock') options.mode = 'mock';
    else if (arg === '--top-k') options.topK = Number(argv[++i]);
    else if (arg === '--models') options.models = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (arg === '--allow-downloads') options.allowDownloads = true;
    else if (arg === '--help' || arg === '-h') {
      process.stderr.write(
        'Usage: node --experimental-strip-types --import ./scripts/ts-resolve-loader.js scripts/retrieval-benchmark.ts [--mock|--real] [--top-k N] [--models id,id] [--allow-downloads]\n\n--allow-downloads permits Codegraph GGUF hf: cache downloads only; transformer lanes follow @huggingface/transformers cache/network environment settings. Real Qwen/GGUF runs use separate document/query ports for asymmetric input formatting, so plan memory accordingly.\n',
      );
      process.exit(0);
    }
  }
  if (options.mode && !['mock', 'real'].includes(options.mode)) {
    throw new Error(`Invalid --mode ${options.mode}; expected mock or real.`);
  }
  return options;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  try {
    const output = await runRetrievalBenchmark(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
