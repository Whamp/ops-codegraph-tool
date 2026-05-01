import {
  MODELS,
  RETRIEVAL_MODEL_PRESETS,
  resolveRetrievalModels,
} from '../../domain/search/index.js';
import type { CommandDefinition } from '../types.js';

const ROLE_ORDER = ['embed', 'rerank', 'expand', 'gen'] as const;

interface ModelEntry {
  dim: number;
  desc: string;
  contextWindow?: number;
  name: string;
}

export const command: CommandDefinition = {
  name: 'models',
  description: 'List retrieval presets and embedding model aliases',
  execute(_args, _opts, ctx) {
    const resolved = resolveRetrievalModels(ctx.config);
    const activeEmbed = resolved.roles.embed;
    const requestedFallback = resolved.requestedPreset
      ? ` (requested "${resolved.requestedPreset}" not found)`
      : '';

    console.log(`\nActive retrieval preset: ${resolved.preset}${requestedFallback}`);
    console.log('\nActive retrieval roles:\n');
    for (const role of ROLE_ORDER) {
      console.log(`  ${role.padEnd(7)} ${resolved.roles[role]}`);
    }

    console.log('\nRetrieval presets:\n');
    for (const [key, preset] of Object.entries(RETRIEVAL_MODEL_PRESETS)) {
      const marker = key === resolved.preset ? '(active)' : '';
      console.log(`  ${key.padEnd(18)} ${marker.padEnd(9)} ${preset.desc}`);
    }

    console.log('\nEmbedding aliases (--model overrides):\n');
    for (const [key, cfg] of Object.entries(MODELS)) {
      const modelCfg = cfg as ModelEntry;
      const marker = key === activeEmbed || modelCfg.name === activeEmbed ? ' (active embed)' : '';
      const ctxWindow = modelCfg.contextWindow ? `${modelCfg.contextWindow} ctx` : '';
      console.log(
        `  ${key.padEnd(12)} ${String(modelCfg.dim).padStart(4)}d  ${ctxWindow.padEnd(9)} ${modelCfg.desc}${marker}`,
      );
    }

    console.log('\nUsage:');
    console.log('  codegraph embed [--model <alias-or-uri>] [--strategy <structured|source>]');
    console.log('  codegraph search "query" [--model <alias-or-uri>]');
    console.log('  .codegraphrc.json: { "models": { "preset": "gno-balanced" } }\n');
  },
};
