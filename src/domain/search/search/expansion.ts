const JSON_EXTRACT_PATTERN = /\{[\s\S]*?\}/;
const QUOTED_PHRASE_PATTERN = /"([^"]+)"/g;
const NEGATION_PATTERN = /-(?:"([^"]+)"|([^\s]+))/g;
const TOKEN_PATTERN = /[A-Za-z0-9][A-Za-z0-9.+#_-]*/g;
const MAX_VARIANTS = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const STRONG_BM25_MIN_SCORE = 0.84;
const STRONG_BM25_MIN_GAP = 0.14;
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

function stripAnchorSpans(query: string): string {
  return query.replace(QUOTED_PHRASE_PATTERN, ' ').replace(NEGATION_PATTERN, ' ');
}

function extractQuerySignals(query: string): QuerySignals {
  const quotedPhrases = dedupeStrings(
    [...query.matchAll(QUOTED_PHRASE_PATTERN)].map((match) => match[1]?.trim() ?? ''),
  );
  const negations = dedupeStrings(
    [...query.matchAll(NEGATION_PATTERN)].map((match) => {
      const phrase = match[1]?.trim();
      if (phrase) return `-"${phrase}"`;
      const token = match[2]?.trim();
      return token ? `-${token}` : '';
    }),
  );
  const criticalEntities = dedupeStrings(
    (stripAnchorSpans(query).match(TOKEN_PATTERN) ?? []).filter(
      (token) => /[A-Z]/.test(token) || /[+#.]/.test(token) || /[A-Za-z]\d|\d[A-Za-z]/.test(token),
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
  return candidate.includes(negation);
}

function hasPositiveNegatedValue(candidate: string, negation: string): boolean {
  const value = parseNegationValue(negation);
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_#.+-])${escaped}($|[^A-Za-z0-9_#.+-])`, 'i').test(candidate);
}

function contradictsNegation(signals: QuerySignals, candidate: string): boolean {
  return signals.negations.some(
    (negation) =>
      !hasNegationAnchor(candidate, negation) && hasPositiveNegatedValue(candidate, negation),
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

export function hasStrongBm25Signal(results: Bm25SignalResult[]): boolean {
  const [top, second] = results;
  if (!top) return false;
  const gap = top.bm25Score - (second?.bm25Score ?? 0);
  return top.bm25Score >= STRONG_BM25_MIN_SCORE && gap >= STRONG_BM25_MIN_GAP;
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
