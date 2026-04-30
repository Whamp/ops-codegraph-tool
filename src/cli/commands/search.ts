import { collectFile } from '../../db/query-builder.js';
import { search } from '../../domain/search/index.js';
import {
  normalizeStructuredQueryInput,
  parseQueryModeSpecs,
} from '../../domain/search/search/expansion.js';
import type { CommandDefinition } from '../types.js';

export const command: CommandDefinition = {
  name: 'search <query>',
  description: 'Semantic search: find functions by natural language description',
  options: [
    ['-d, --db <path>', 'Path to graph.db'],
    ['-m, --model <name>', 'Override embedding model (auto-detects from DB)'],
    ['-n, --limit <number>', 'Max results', '15'],
    ['-T, --no-tests', 'Exclude test/spec files from results'],
    ['--include-tests', 'Include test/spec files (overrides excludeTests config)'],
    ['--min-score <score>', 'Minimum similarity threshold', '0.2'],
    ['-k, --kind <kind>', 'Filter by kind: function, method, class'],
    ['--file <pattern>', 'Filter by file path pattern (repeatable)', collectFile],
    ['--rrf-k <number>', 'RRF k parameter for multi-query ranking', '60'],
    ['--mode <mode>', 'Search mode: hybrid, semantic, keyword (default: hybrid)'],
    ['--expand', 'Enable query expansion for hybrid search'],
    ['--no-expand', 'Disable query expansion for hybrid search'],
    [
      '--query-mode <mode:text>',
      'Structured query mode (repeatable): term:<text>, intent:<text>, or hyde:<text>',
      collectFile,
    ],
    ['-j, --json', 'Output as JSON'],
    ['--explain', 'Include weighted RRF source contribution metadata'],
    ['--offset <number>', 'Skip N results (default: 0)'],
    ['--ndjson', 'Newline-delimited JSON output'],
  ],
  validate([_query], opts) {
    const validModes = ['hybrid', 'semantic', 'keyword'];
    if (opts.mode && !validModes.includes(opts.mode as string)) {
      return `Invalid mode "${opts.mode}". Valid: ${validModes.join(', ')}`;
    }
    try {
      const explicitModes = parseQueryModeSpecs((opts.queryMode || []) as string[]);
      normalizeStructuredQueryInput(_query || '', explicitModes);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  },
  async execute([query], opts, ctx) {
    const fileArr = (opts.file || []) as string[];
    const filePattern =
      fileArr.length === 1 ? fileArr[0] : fileArr.length > 1 ? fileArr : undefined;
    const explicitModes = parseQueryModeSpecs((opts.queryMode || []) as string[]);
    const normalized = normalizeStructuredQueryInput(query!, explicitModes);
    const hasStructuredModes = normalized.queryModes.length > 0;
    await search(normalized.query, opts.db as string | undefined, {
      limit: parseInt(opts.limit as string, 10),
      noTests: ctx.resolveNoTests(opts),
      minScore: parseFloat(opts.minScore as string),
      model: opts.model as string | undefined,
      kind: opts.kind as string | undefined,
      filePattern,
      rrfK: parseInt(opts.rrfK as string, 10),
      mode: opts.mode as 'hybrid' | 'semantic' | 'keyword' | undefined,
      expand: hasStructuredModes ? false : (opts.expand as boolean | undefined),
      queryModes: normalized.queryModes,
      queryTextKind: normalized.queryTextKind,
      json: opts.json as boolean | undefined,
      explain: opts.explain as boolean | undefined,
    });
  },
};
