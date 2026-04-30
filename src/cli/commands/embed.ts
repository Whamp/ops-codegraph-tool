import path from 'node:path';
import { isHttpModelUri } from '../../domain/search/http-embedding.js';
import {
  buildEmbeddings,
  DEFAULT_MODEL,
  EMBEDDING_STRATEGIES,
  MODELS,
  resolveModelRoleUri,
} from '../../domain/search/index.js';
import { isGgufModelUri } from '../../domain/search/model-cache.js';
import { warn } from '../../infrastructure/logger.js';
import type { CommandDefinition } from '../types.js';

function isSupportedEmbeddingModel(model: string): boolean {
  return (
    MODELS[model] != null ||
    Object.values(MODELS).some((config) => config.name === model) ||
    isHttpModelUri(model) ||
    isGgufModelUri(model)
  );
}

function resolveEmbedCommandModel(
  explicitModel: string | undefined,
  config: Parameters<typeof resolveModelRoleUri>[0],
): string {
  if (explicitModel) return explicitModel;

  const roleModel = resolveModelRoleUri(config, 'embed');
  if (isSupportedEmbeddingModel(roleModel)) return roleModel;

  const legacyModel = config?.embeddings?.model || DEFAULT_MODEL;
  warn(
    `Embed role resolved to unsupported model "${roleModel}" for the current transformer runtime; using legacy embedding model "${legacyModel}".`,
  );
  return legacyModel;
}

export const command: CommandDefinition = {
  name: 'embed [dir]',
  description:
    'Build semantic embeddings for all functions/methods/classes (requires prior `build`)',
  options: [
    [
      '-m, --model <name>',
      'Embedding model (default from config: GNO/Qwen compact GGUF). Run `codegraph models` for details',
    ],
    [
      '-s, --strategy <name>',
      `Embedding strategy: ${EMBEDDING_STRATEGIES.join(', ')}. "structured" uses graph context (callers/callees), "source" embeds raw code`,
      'structured',
    ],
    ['-d, --db <path>', 'Path to graph.db'],
  ],
  validate([_dir], opts) {
    if (!(EMBEDDING_STRATEGIES as readonly string[]).includes(opts.strategy)) {
      return `Unknown strategy: ${opts.strategy}. Available: ${EMBEDDING_STRATEGIES.join(', ')}`;
    }
  },
  async execute([dir], opts, ctx) {
    const root = path.resolve(dir || '.');
    const model = resolveEmbedCommandModel(opts.model as string | undefined, ctx.config);
    await buildEmbeddings(root, model, opts.db as string | undefined, { strategy: opts.strategy });
  },
};
