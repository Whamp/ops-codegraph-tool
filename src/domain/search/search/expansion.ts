const JSON_EXTRACT_PATTERN = /\{[\s\S]*?\}/;
const QUOTED_PHRASE_PATTERN = /"([^"]+)"/g;
const NEGATION_PATTERN =
  /(^|[\s([{,.;:!?])-(?:"([^"]+)"|([A-Za-z0-9_+#-](?:[A-Za-z0-9_+#-]|\.(?=[A-Za-z0-9_+#-]))*))/g;
const TOKEN_PATTERN = /[A-Za-z0-9][A-Za-z0-9.+#_-]*/g;
const MAX_VARIANTS = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
]);

export type QueryMode = 'term' | 'intent' | 'hyde';

export interface QueryModeInput {
  mode: QueryMode;
  text: string;
}

export interface StructuredQueryNormalization {
  query: string;
  queryModes: QueryModeInput[];
  usedStructuredQuerySyntax: boolean;
  derivedQuery: boolean;
}

export interface ExpansionResult {
  lexicalQueries: string[];
  vectorQueries: string[];
  hyde?: string;
  notes?: string;
}

export interface ExpansionProvider {
  generate(
    prompt: string,
    options: { temperature: 0; seed: 42; maxTokens: number },
  ): Promise<string>;
}

export interface QueryExpansionOptions {
  enabled?: boolean;
  provider?: ExpansionProvider;
  timeoutMs?: number;
  queryModes?: QueryModeInput[];
}

export interface RoutedQueries {
  bm25Queries: string[];
  semanticQueries: string[];
  expansion: ExpansionResult | null;
  skipped: 'disabled' | 'no_provider' | 'strong_bm25' | 'failed' | null;
}

interface QuerySignals {
  quotedPhrases: string[];
  negations: string[];
  criticalEntities: string[];
  overlapTokens: Set<string>;
}

export interface Bm25SignalResult {
  name?: string;
  bm25Score: number;
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function extractOverlapTokens(text: string): Set<string> {
  const tokens = text.match(TOKEN_PATTERN) ?? [];
  return new Set(
    tokens
      .map((token) => token.toLowerCase().trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
  );
}

function stripNegationSpans(query: string): string {
  return query.replace(NEGATION_PATTERN, ' ');
}

function stripAnchorSpans(query: string): string {
  return stripNegationSpans(query).replace(QUOTED_PHRASE_PATTERN, ' ');
}

function extractQuerySignals(query: string): QuerySignals {
  const negationMatches = [...query.matchAll(NEGATION_PATTERN)];
  const negationSpans = negationMatches.map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const quotedPhrases = dedupeStrings(
    [...query.matchAll(QUOTED_PHRASE_PATTERN)]
      .filter((match) => {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        return !negationSpans.some((span) => start >= span.start && end <= span.end);
      })
      .map((match) => match[1]?.trim() ?? ''),
  );
  const negations = dedupeStrings(
    negationMatches.map((match) => {
      const phrase = match[2]?.trim();
      if (phrase) return `-"${phrase}"`;
      const token = match[3]?.trim();
      return token ? `-${token}` : '';
    }),
  );
  const criticalEntities = dedupeStrings(
    (stripAnchorSpans(query).match(TOKEN_PATTERN) ?? []).filter(
      (token) =>
        /[A-Z]/.test(token) || /[_.+#-]/.test(token) || /[A-Za-z]\d|\d[A-Za-z]/.test(token),
    ),
  );
  return { quotedPhrases, negations, criticalEntities, overlapTokens: extractOverlapTokens(query) };
}

function hasCaseInsensitiveSubstring(text: string, part: string): boolean {
  return text.toLowerCase().includes(part.toLowerCase());
}

function parseNegationValue(negation: string): string {
  if (negation.startsWith('-"') && negation.endsWith('"')) return negation.slice(2, -1);
  return negation.slice(1);
}

function hasNegationAnchor(candidate: string, negation: string): boolean {
  const value = parseNegationValue(negation);
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const negatedValue = negation.startsWith('-"') ? `"${escaped}"` : escaped;
  return new RegExp(`(^|[\\s([{,.;:!?])-${negatedValue}($|[\\s)\\]},.;:!?])`).test(candidate);
}

function hasPositiveNegatedValue(candidate: string, negation: string): boolean {
  const value = parseNegationValue(negation);
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(^|[^A-Za-z0-9_#.+-])${escaped}(?=$|[^A-Za-z0-9_#.+-]|\\.(?:$|\\s))`,
    'i',
  ).test(candidate);
}

function contradictsNegation(signals: QuerySignals, candidate: string): boolean {
  const candidateWithoutNegations = stripNegationSpans(candidate);
  return signals.negations.some((negation) =>
    hasPositiveNegatedValue(candidateWithoutNegations, negation),
  );
}

function hasRequiredAnchors(
  signals: QuerySignals,
  candidate: string,
  exactLexical: boolean,
): boolean {
  if (!candidate.trim() || contradictsNegation(signals, candidate)) return false;
  for (const phrase of signals.quotedPhrases) {
    if (exactLexical) {
      if (!candidate.includes(`"${phrase}"`)) return false;
    } else if (!hasCaseInsensitiveSubstring(candidate, phrase)) return false;
  }
  for (const negation of signals.negations)
    if (!hasNegationAnchor(candidate, negation)) return false;
  for (const entity of signals.criticalEntities) if (!candidate.includes(entity)) return false;
  return true;
}

function hasSufficientOverlap(signals: QuerySignals, candidate: string): boolean {
  if (!candidate.trim() || contradictsNegation(signals, candidate)) return false;
  if ([...signals.quotedPhrases, ...signals.negations, ...signals.criticalEntities].length > 0) {
    return hasRequiredAnchors(signals, candidate, false);
  }
  for (const token of extractOverlapTokens(candidate))
    if (signals.overlapTokens.has(token)) return true;
  return false;
}

function buildAnchorLexicalQuery(query: string, signals: QuerySignals): string {
  const parts = [
    ...signals.criticalEntities,
    ...signals.quotedPhrases.map((phrase) => `"${phrase}"`),
    ...signals.negations,
  ];
  return dedupeStrings(parts).join(' ').trim() || query.trim();
}

const QUERY_MODE_ENTRY = /^\s*(term|intent|hyde)\s*:\s*([\s\S]*\S[\s\S]*)\s*$/i;
const ANY_PREFIX_PATTERN = /^\s*([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i;
const RECOGNIZED_PREFIX_PATTERN = /^\s*(term|intent|hyde)\s*:\s*(.*)$/i;
const RECOGNIZED_MODE_PREFIXES = new Set(['term', 'intent', 'hyde']);

function structuredQueryError(message: string, line?: number | null): Error {
  return new Error(line == null ? message : `Structured query line ${line}: ${message}`);
}

export function parseQueryModeSpec(spec: string): QueryModeInput {
  const prefix = spec.match(/^\s*([a-z][a-z0-9_-]*)\s*:/i)?.[1]?.toLowerCase();
  const match = spec.match(QUERY_MODE_ENTRY);
  if (!match) {
    if (prefix && RECOGNIZED_MODE_PREFIXES.has(prefix)) {
      throw new Error(
        `Invalid --query-mode value "${spec}". Expected non-empty text after ${prefix}:`,
      );
    }
    throw new Error(
      `Invalid --query-mode value "${spec}". Expected "term:<text>", "intent:<text>", or "hyde:<text>".`,
    );
  }
  return { mode: match[1]!.toLowerCase() as QueryMode, text: match[2]!.trim() };
}

function normalizeQueryModeEntries(queryModes: QueryModeInput[]): QueryModeInput[] {
  return queryModes.map((entry) => ({
    mode: entry.mode,
    text: entry.text.trim(),
  }));
}

function validateQueryModeShape(queryModes: QueryModeInput[]): QueryModeInput[] {
  const normalized = normalizeQueryModeEntries(queryModes);
  for (const entry of normalized) {
    if (!RECOGNIZED_MODE_PREFIXES.has(entry.mode) || !entry.text) {
      throw new Error('Query modes must use term, intent, or hyde with non-empty text.');
    }
  }
  if (normalized.filter((entry) => entry.mode === 'hyde').length > 1) {
    throw new Error('Only one hyde mode is allowed in structured query input.');
  }
  return normalized;
}

export function validateQueryModes(queryModes: QueryModeInput[]): QueryModeInput[] {
  const normalized = validateQueryModeShape(queryModes);
  if (normalized.length > 0 && normalized.every((entry) => entry.mode === 'hyde')) {
    throw new Error('HyDE-only inputs are not allowed; include a plain query, term, or intent.');
  }
  return normalized;
}

export function parseQueryModeSpecs(specs: string[]): QueryModeInput[] {
  return validateQueryModeShape(specs.map((spec) => parseQueryModeSpec(spec)));
}

export function normalizeStructuredQueryInput(
  query: string,
  explicitQueryModes: QueryModeInput[] = [],
): StructuredQueryNormalization {
  const explicit = validateQueryModeShape(explicitQueryModes);
  if (!query.includes('\n')) {
    return { query, queryModes: explicit, usedStructuredQuerySyntax: false, derivedQuery: false };
  }

  const nonBlankLines = query.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (nonBlankLines.length === 0) {
    return { query, queryModes: explicit, usedStructuredQuerySyntax: false, derivedQuery: false };
  }

  const hasTypedLine = nonBlankLines.some((line) => ANY_PREFIX_PATTERN.test(line.trim()));
  if (!hasTypedLine) {
    return { query, queryModes: explicit, usedStructuredQuerySyntax: false, derivedQuery: false };
  }

  const queryModes: QueryModeInput[] = [];
  const bodyLines: string[] = [];
  let hydeCount = 0;

  for (const [index, line] of query.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const recognized = trimmed.match(RECOGNIZED_PREFIX_PATTERN);
    if (recognized) {
      const mode = recognized[1]!.toLowerCase() as QueryMode;
      const text = recognized[2]?.trim() ?? '';
      if (!text)
        throw structuredQueryError(`line ${index + 1} must contain non-empty text after ${mode}:`);
      if (mode === 'hyde') {
        hydeCount += 1;
        if (hydeCount > 1)
          throw structuredQueryError(
            'Only one hyde line is allowed in a structured query document.',
            index + 1,
          );
      }
      queryModes.push({ mode, text });
      continue;
    }

    const prefixed = trimmed.match(ANY_PREFIX_PATTERN);
    if (prefixed?.[1]) {
      const prefix = prefixed[1].toLowerCase();
      if (!RECOGNIZED_MODE_PREFIXES.has(prefix)) {
        throw structuredQueryError(
          `Unknown structured query line prefix "${prefix}:" on line ${index + 1}. Expected term:, intent:, or hyde:.`,
          index + 1,
        );
      }
    }
    bodyLines.push(trimmed);
  }

  const combinedQueryModes = normalizeQueryModeEntries([...queryModes, ...explicit]);
  if (combinedQueryModes.filter((entry) => entry.mode === 'hyde').length > 1) {
    throw new Error(
      'Only one hyde entry is allowed across structured query syntax and explicit query modes.',
    );
  }
  let normalizedQuery = bodyLines.join(' ').trim();
  let derivedQuery = false;
  if (!normalizedQuery) {
    normalizedQuery = queryModes
      .filter((entry) => entry.mode === 'term')
      .map((entry) => entry.text)
      .join(' ')
      .trim();
    if (!normalizedQuery) {
      normalizedQuery = queryModes
        .filter((entry) => entry.mode === 'intent')
        .map((entry) => entry.text)
        .join(' ')
        .trim();
    }
    derivedQuery = normalizedQuery.length > 0;
  }
  if (!normalizedQuery) {
    throw new Error(
      'Structured query documents must include at least one plain query line, term line, or intent line. hyde-only documents are not allowed.',
    );
  }

  return {
    query: normalizedQuery,
    queryModes: combinedQueryModes,
    usedStructuredQuerySyntax: true,
    derivedQuery,
  };
}

export function buildExpansionFromQueryModes(queryModes: QueryModeInput[]): ExpansionResult | null {
  if (queryModes.length === 0) return null;
  const valid = validateQueryModeShape(queryModes);
  const lexicalQueries = dedupeStrings(
    valid.filter((entry) => entry.mode === 'term').map((entry) => entry.text),
  ).slice(0, MAX_VARIANTS);
  const vectorQueries = dedupeStrings(
    valid.filter((entry) => entry.mode === 'intent').map((entry) => entry.text),
  ).slice(0, MAX_VARIANTS);
  const hyde = valid.find((entry) => entry.mode === 'hyde')?.text;
  return { lexicalQueries, vectorQueries, ...(hyde ? { hyde } : {}) };
}

export function applyExpansionGuardrails(
  query: string,
  expansion: ExpansionResult,
): ExpansionResult {
  const signals = extractQuerySignals(query);
  const lexical = dedupeStrings([
    buildAnchorLexicalQuery(query, signals),
    ...expansion.lexicalQueries,
  ])
    .filter((variant) =>
      [...signals.quotedPhrases, ...signals.negations, ...signals.criticalEntities].length > 0
        ? hasRequiredAnchors(signals, variant, true)
        : hasSufficientOverlap(signals, variant),
    )
    .slice(0, MAX_VARIANTS);
  const vector = dedupeStrings(expansion.vectorQueries)
    .filter((variant) => hasSufficientOverlap(signals, variant))
    .slice(0, MAX_VARIANTS);
  const hyde =
    expansion.hyde && hasSufficientOverlap(signals, expansion.hyde)
      ? expansion.hyde.trim()
      : undefined;

  return {
    lexicalQueries: lexical.length > 0 ? lexical : [query.trim()],
    vectorQueries: vector.length > 0 ? vector : [query.trim()],
    ...(hyde ? { hyde } : {}),
    ...(expansion.notes ? { notes: expansion.notes } : {}),
  };
}

export function parseExpansionOutput(output: string, query: string): ExpansionResult | null {
  try {
    const match = output.match(JSON_EXTRACT_PATTERN);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (!Array.isArray(parsed.lexicalQueries) || !Array.isArray(parsed.vectorQueries)) return null;
    const expansion: ExpansionResult = {
      lexicalQueries: parsed.lexicalQueries
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, MAX_VARIANTS),
      vectorQueries: parsed.vectorQueries
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, MAX_VARIANTS),
    };
    if (typeof parsed.hyde === 'string' && parsed.hyde.trim()) expansion.hyde = parsed.hyde.trim();
    if (typeof parsed.notes === 'string') expansion.notes = parsed.notes;
    return applyExpansionGuardrails(query, expansion);
  } catch {
    return null;
  }
}

export function buildExpansionPrompt(query: string): string {
  return `You expand search queries for Codegraph hybrid code search.\n\nQuery: "${query}"\n\nGenerate JSON with:\n1. "lexicalQueries": 2-3 keyword variations for BM25\n2. "vectorQueries": 2-3 semantic rephrasings for embeddings\n3. "hyde": one 50-100 word passage that directly answers the query as if from code documentation\n\nRules:\n- Keep identifiers, proper nouns, acronyms, quoted phrases, negations, and code symbols exactly as written\n- Lexical queries must preserve quoted phrases and negated terms\n- Keep symbol-heavy technical entities exactly, for example C++, C#, Node.js, React.useEffect\n- Be concise; each variation should be 3-8 words\n- HyDE should read like documentation, not a question\n\nRespond with valid JSON only.`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function expandOrFallback(
  query: string,
  options: QueryExpansionOptions = {},
): Promise<ExpansionResult | null> {
  if (!options.enabled || !options.provider) return null;
  try {
    const output = await withTimeout(
      options.provider.generate(buildExpansionPrompt(query), {
        temperature: 0,
        seed: 42,
        maxTokens: 512,
      }),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    return output ? parseExpansionOutput(output, query) : null;
  } catch {
    return null;
  }
}

function normalizeExactQuery(query: string): string {
  return query
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .toLowerCase();
}

export function hasStrongExactBm25Signal(query: string, results: Bm25SignalResult[]): boolean {
  const [top, second] = results;
  if (!top) return false;
  const normalizedQuery = normalizeExactQuery(query);
  const exactName = top.name?.toLowerCase() === normalizedQuery;
  const gap = top.bm25Score - (second?.bm25Score ?? 0);
  return Boolean(exactName && top.bm25Score > 0 && gap > 0);
}

export async function routeExpandedQueries(
  query: string,
  options: QueryExpansionOptions,
  bm25ProbeResults: Bm25SignalResult[],
): Promise<RoutedQueries> {
  const original = query.trim();
  const queryModeExpansion = buildExpansionFromQueryModes(options.queryModes ?? []);
  if (queryModeExpansion) {
    return {
      bm25Queries: dedupeStrings([original, ...queryModeExpansion.lexicalQueries]),
      semanticQueries: dedupeStrings([
        original,
        ...queryModeExpansion.vectorQueries,
        ...(queryModeExpansion.hyde ? [queryModeExpansion.hyde] : []),
      ]),
      expansion: queryModeExpansion,
      skipped: null,
    };
  }
  if (!options.enabled) {
    return {
      bm25Queries: [original],
      semanticQueries: [original],
      expansion: null,
      skipped: 'disabled',
    };
  }
  if (hasStrongExactBm25Signal(original, bm25ProbeResults)) {
    return {
      bm25Queries: [original],
      semanticQueries: [original],
      expansion: null,
      skipped: 'strong_bm25',
    };
  }
  if (!options.provider) {
    return {
      bm25Queries: [original],
      semanticQueries: [original],
      expansion: null,
      skipped: 'no_provider',
    };
  }
  const expansion = await expandOrFallback(original, options);
  if (!expansion) {
    return {
      bm25Queries: [original],
      semanticQueries: [original],
      expansion: null,
      skipped: 'failed',
    };
  }
  return {
    bm25Queries: dedupeStrings([original, ...expansion.lexicalQueries]),
    semanticQueries: dedupeStrings([
      original,
      ...expansion.vectorQueries,
      ...(expansion.hyde ? [expansion.hyde] : []),
    ]),
    expansion,
    skipped: null,
  };
}
