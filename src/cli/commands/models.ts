import {
  MODELS,
  RETRIEVAL_MODEL_PRESETS,
  resolveRetrievalModels,
} from '../../domain/search/index.js';
import type { CommandDefinition } from '../types.js';

interface ModelEntry {
  dim: number;
  desc: string;
  contextWindow?: number;
  name: string;
}

const ROLE_LABELS: Record<string, string> = {
  embed: 'embed   ',
  rerank: 'rerank  ',
  expand: 'expand  ',
  gen: 'gen     ',
};

function shortUri(uri: string): string {
  if (!uri.startsWith('hf:')) return uri;
  // hf:org/repo/file.gguf → org/file.gguf
  const parts = uri.slice(3).split('/');
  if (parts.length < 3) return uri;
  return `${parts[0]}/${parts[parts.length - 1]}`;
}

export const command: CommandDefinition = {
  name: 'models',
  description: 'Show model configuration and available presets',
  execute(_args, _opts, ctx) {
    const resolved = resolveRetrievalModels(ctx.config);
    const activeEmbed = resolved.roles.embed;

    // Preset
    const fallback = resolved.requestedPreset ? ` ("${resolved.requestedPreset}" not found)` : '';
    console.log(`\nPreset: ${resolved.preset}${fallback}`);

    // Roles under the active preset
    console.log('');
    for (const role of Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>) {
      const uri = resolved.roles[role as 'embed'];
      console.log(`  ${ROLE_LABELS[role]} ${shortUri(uri)}`);
    }

    // All presets
    console.log('\nPresets:');
    for (const [key, preset] of Object.entries(RETRIEVAL_MODEL_PRESETS)) {
      const marker = key === resolved.preset ? ' ←' : '';
      console.log(`  ${key.padEnd(18)} ${preset.desc}${marker}`);
    }

    // Legacy embedding aliases
    console.log('\nEmbedding aliases (--model):');
    for (const [key, cfg] of Object.entries(MODELS)) {
      const modelCfg = cfg as ModelEntry;
      const active = key === activeEmbed || modelCfg.name === activeEmbed ? ' ← active' : '';
      const ctxWindow = modelCfg.contextWindow ? `${modelCfg.contextWindow} ctx` : '';
      console.log(
        `  ${key.padEnd(12)} ${String(modelCfg.dim).padStart(4)}d  ${ctxWindow.padEnd(9)} ${modelCfg.desc}${active}`,
      );
    }

    console.log('\nConfig:');
    console.log('  .codegraphrc.json → { "models": { "preset": "balanced" } }');
    console.log('  codegraph embed [--model <alias-or-uri>] [--strategy <structured|source>]');
    console.log('  codegraph search "query" [--model <alias-or-uri>]\n');
  },
};
