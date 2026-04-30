/**
 * Cross-encoder reranking with safe blending and lexical-hit protection.
 *
 * Uses a RerankPort to reorder top fusion candidates. When no port is supplied
 * or the port fails, falls back cleanly to fusion-only ordering with actionable
 * explain metadata.
 *
 * @module src/domain/search/search/rerank
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RerankScore {
  index: number;
  score: number;
}

export interface RerankResult<T = RerankScore[]> {
  ok: boolean;
  value?: T;
  error?: Error;
}

/** Pluggable rerank port — inject a cross-encoder or mock implementation. */
export interface RerankPort {
  rerank(query: string, documents: string[]): Promise<RerankResult>;
}

/** Create a rerank port for safe built-in URI schemes. Local model URIs are intentionally unsupported here. */
export function createDefaultRerankPort(uri: string | undefined): RerankPort | null {
  if (!uri) return null;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return {
    async rerank(query: string, documents: string[]): Promise<RerankResult> {
      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query, documents }),
        });
        if (!response.ok) {
          return { ok: false, error: new Error(`HTTP ${response.status}`) };
        }
        const json = (await response.json()) as unknown;
        const scores = Array.isArray(json)
          ? json
          : typeof json === 'object' &&
              json !== null &&
              Array.isArray((json as { scores?: unknown }).scores)
            ? (json as { scores: unknown[] }).scores
            : null;
        if (!scores) return { ok: false, error: new Error('Invalid rerank response') };
        const value = scores.flatMap((entry) => {
          if (typeof entry !== 'object' || entry === null) return [];
          const index = (entry as { index?: unknown }).index;
          const score = (entry as { score?: unknown }).score;
          return typeof index === 'number' && typeof score === 'number' ? [{ index, score }] : [];
        });
        return { ok: true, value };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
  };
}

export interface RerankCandidate {
  /** Unique key for the candidate (name:file:line) */
  key: string;
  name: string;
  kind: string;
  file: string;
  line: number;
  /** RRF fusion score from hybrid search */
  fusionScore: number;
  /** BM25 rank (null if candidate was not in BM25 results) */
  bm25Rank: number | null;
  /** True only for the original/plain lexical BM25 rank-1 hit */
  lexicalExactTopHit?: boolean;
  /** Explicit text for reranking when callers have already selected the best source. */
  text?: string;
  /** Full embedded symbol text, preferred over FTS content and previews. */
  full_text?: string;
  /** Full embedded symbol text, camelCase variant. */
  fullText?: string;
  /** Full FTS content, preferred over previews. */
  content?: string;
  /** Short embedded text preview. */
  text_preview?: string;
  /** Short embedded text preview, camelCase variant. */
  textPreview?: string;
}

export interface RerankedCandidate extends RerankCandidate {
  /** Cross-encoder score (normalized 0-1), null when not reranked */
  rerankScore: number | null;
  /** Final blended score combining fusion and rerank */
  blendedScore: number;
  explain?: RerankExplain;
}

export interface RerankExplain {
  /** True if this candidate was not reranked due to port failure */
  rerankFallback?: boolean;
  /** Stable fallback code when reranking could not be applied */
  fallbackCode?: 'disabled' | 'port_error';
  /** Sanitized fallback message suitable for explain output */
  fallbackMessage?: string;
  /** True if this candidate was protected as the lexical top hit */
  protectedLexicalHit?: boolean;
  /** Fusion weight used in blending */
  fusionWeight: number;
  /** Rerank weight used in blending */
  rerankWeight: number;
  /** Normalized fusion score (0-1) */
  normalizedFusion: number;
  /** Normalized rerank score (0-1), null when not reranked */
  normalizedRerank: number | null;
}

export interface RerankOptions {
  /** Max candidates to send to the rerank port (default: from config, typically 20) */
  maxCandidates?: number;
  /** Weight for fusion scores in blending (default: 0.4) */
  fusionWeight?: number;
  /** Weight for rerank scores in blending (default: 0.6) */
  rerankWeight?: number;
  /** Optional intent context for intent-aware rerank queries */
  intent?: string;
}

export interface RerankOutput {
  candidates: RerankedCandidate[];
  reranked: boolean;
  fallbackReason: 'none' | 'disabled' | 'error';
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PROTECT_BM25_TOP_RANK = 1;
const REMAINING_CANDIDATE_PENALTY = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Score normalization
// ─────────────────────────────────────────────────────────────────────────────

function normalizeScores(scores: number[]): (score: number) => number {
  if (scores.length === 0) return () => 1;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  if (range < 1e-9) return () => 1;
  return (score: number) => Math.max(0, Math.min(1, (score - min) / range));
}

// ─────────────────────────────────────────────────────────────────────────────
// Text extraction
// ─────────────────────────────────────────────────────────────────────────────

function candidateText(candidate: RerankCandidate): string {
  const candidates = [
    candidate.full_text,
    candidate.fullText,
    candidate.content,
    candidate.text_preview,
    candidate.textPreview,
    candidate.text,
  ];
  const selected = candidates.find((text) => typeof text === 'string' && text.trim().length > 0);
  if (selected) return selected;
  // Fallback: construct text from metadata
  return `${candidate.name} (${candidate.kind}) — ${candidate.file}:${candidate.line}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent-aware query building
// ─────────────────────────────────────────────────────────────────────────────

function buildRerankQuery(query: string, intent?: string): string {
  if (!intent) return query;
  return `${query}\nContext: ${intent}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lexical-hit protection
// ─────────────────────────────────────────────────────────────────────────────

function isProtectedLexicalTopHit(candidate: RerankCandidate): boolean {
  return candidate.lexicalExactTopHit === true && candidate.bm25Rank === PROTECT_BM25_TOP_RANK;
}

function sanitizeFallbackMessage(message: string): string {
  return message
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function fallbackCandidates(
  candidates: RerankCandidate[],
  normalizeFusion: (score: number) => number,
  fusionWeight: number,
  rerankWeight: number,
  fallbackCode: 'disabled' | 'port_error',
  message?: string,
): RerankedCandidate[] {
  const fallbackMessage = message ? sanitizeFallbackMessage(message) : undefined;
  return candidates
    .map((c) => ({
      ...c,
      rerankScore: null,
      blendedScore: normalizeFusion(c.fusionScore),
      explain: {
        rerankFallback: true,
        fallbackCode,
        ...(fallbackMessage ? { fallbackMessage } : {}),
        fusionWeight,
        rerankWeight,
        normalizedFusion: normalizeFusion(c.fusionScore),
        normalizedRerank: null,
      },
    }))
    .sort((a, b) => {
      const diff = b.blendedScore - a.blendedScore;
      if (Math.abs(diff) > 1e-9) return diff;
      return a.key.localeCompare(b.key);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main rerank function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rerank fusion candidates using a cross-encoder port.
 *
 * Falls back to fusion-only ordering when:
 * - No rerank port is supplied (fallbackReason: 'disabled')
 * - The rerank port returns an error or throws (fallbackReason: 'error')
 *
 * Protection: the original BM25 rank-1 hit is never demoted below position 1
 * for exact lexical queries, even if the cross-encoder disagrees.
 */
export async function rerankCandidates(
  rerankPort: RerankPort | null,
  query: string,
  candidates: RerankCandidate[],
  options: RerankOptions = {},
): Promise<RerankOutput> {
  // Empty input → empty output
  if (candidates.length === 0) {
    return { candidates: [], reranked: false, fallbackReason: 'none' };
  }

  const fusionWeight = options.fusionWeight ?? 0.4;
  const rerankWeight = options.rerankWeight ?? 0.6;
  const maxCandidates = options.maxCandidates ?? 20;

  // Normalize fusion scores across all candidates
  const fusionScores = candidates.map((c) => c.fusionScore);
  const normalizeFusion = normalizeScores(fusionScores);

  // No reranker: return fusion-only ordering
  if (!rerankPort) {
    return {
      candidates: fallbackCandidates(
        candidates,
        normalizeFusion,
        fusionWeight,
        rerankWeight,
        'disabled',
      ),
      reranked: false,
      fallbackReason: 'disabled',
    };
  }

  // Slice candidates for reranking
  const toRerank = candidates.slice(0, maxCandidates);
  const remaining = candidates.slice(maxCandidates);

  // Extract texts and deduplicate
  const texts = toRerank.map(candidateText);
  const uniqueTexts: string[] = [];
  const textToUniqueIndex = new Map<string, number>();
  const originalIndexToUniqueIndex = new Map<number, number>();
  const uniqueIndexToOriginalIndices = new Map<number, number[]>();

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!;
    const existing = textToUniqueIndex.get(text);
    if (existing !== undefined) {
      originalIndexToUniqueIndex.set(i, existing);
      uniqueIndexToOriginalIndices.get(existing)!.push(i);
    } else {
      const uniqueIndex = uniqueTexts.length;
      uniqueTexts.push(text);
      textToUniqueIndex.set(text, uniqueIndex);
      originalIndexToUniqueIndex.set(i, uniqueIndex);
      uniqueIndexToOriginalIndices.set(uniqueIndex, [i]);
    }
  }

  // Build intent-aware query
  const rerankQuery = buildRerankQuery(query, options.intent);

  // Call the rerank port
  let rerankResult: RerankResult;
  try {
    rerankResult = await rerankPort.rerank(rerankQuery, uniqueTexts);
  } catch (err) {
    // Port threw — fall back to fusion-only
    return {
      candidates: fallbackCandidates(
        candidates,
        normalizeFusion,
        fusionWeight,
        rerankWeight,
        'port_error',
        err instanceof Error ? err.message : String(err),
      ),
      reranked: false,
      fallbackReason: 'error',
    };
  }

  // Port returned failure — fall back
  if (!rerankResult.ok || !rerankResult.value) {
    return {
      candidates: fallbackCandidates(
        candidates,
        normalizeFusion,
        fusionWeight,
        rerankWeight,
        'port_error',
        rerankResult.error?.message ?? 'Rerank port returned an error',
      ),
      reranked: false,
      fallbackReason: 'error',
    };
  }

  // Map rerank scores back to original candidate indices
  const rerankScoresByUniqueIndex = new Map<number, number>();
  for (const scoreEntry of rerankResult.value) {
    rerankScoresByUniqueIndex.set(scoreEntry.index, scoreEntry.score);
  }

  const scoreByOriginalIndex = new Map<number, number>();
  for (let i = 0; i < toRerank.length; i++) {
    const uniqueIndex = originalIndexToUniqueIndex.get(i)!;
    const score = rerankScoresByUniqueIndex.get(uniqueIndex);
    if (score !== undefined) {
      scoreByOriginalIndex.set(i, score);
    }
  }

  // Normalize rerank scores
  const allRerankScores = [...scoreByOriginalIndex.values()];
  const normalizeRerank = normalizeScores(allRerankScores);

  // Build reranked candidates with blended scores
  const rerankedCandidates: RerankedCandidate[] = toRerank.map((c, i) => {
    const rawRerank = scoreByOriginalIndex.get(i);
    const normalizedRerank = rawRerank !== undefined ? normalizeRerank(rawRerank) : null;
    const normalizedFusion = normalizeFusion(c.fusionScore);
    const blendedScore =
      normalizedRerank !== null
        ? fusionWeight * normalizedFusion + rerankWeight * normalizedRerank
        : normalizedFusion;

    return {
      ...c,
      rerankScore: normalizedRerank,
      blendedScore,
      explain: {
        fusionWeight,
        rerankWeight,
        normalizedFusion,
        normalizedRerank,
      },
    };
  });

  // Add remaining candidates with penalty
  const allCandidates: RerankedCandidate[] = [
    ...rerankedCandidates,
    ...remaining.map((c) => ({
      ...c,
      rerankScore: null as number | null,
      blendedScore: Math.max(
        0,
        Math.min(1, normalizeFusion(c.fusionScore) * REMAINING_CANDIDATE_PENALTY),
      ),
      explain: {
        fusionWeight,
        rerankWeight,
        normalizedFusion: normalizeFusion(c.fusionScore) * REMAINING_CANDIDATE_PENALTY,
        normalizedRerank: null,
      },
    })),
  ];

  // Sort by blended score with deterministic tie-breaking
  allCandidates.sort((a, b) => {
    const diff = b.blendedScore - a.blendedScore;
    if (Math.abs(diff) > 1e-9) return diff;
    return a.key.localeCompare(b.key);
  });

  // Guardrail: protect strong lexical #1 hit from rerank-only demotion
  const protectedTopHit = allCandidates.find(isProtectedLexicalTopHit);
  if (protectedTopHit && allCandidates[0] !== protectedTopHit) {
    // Move protected hit to position 0
    const filtered = allCandidates.filter((c) => c !== protectedTopHit);
    filtered.unshift({
      ...protectedTopHit,
      explain: {
        ...protectedTopHit.explain!,
        protectedLexicalHit: true,
      },
    });
    return { candidates: filtered, reranked: true, fallbackReason: 'none' };
  }

  return { candidates: allCandidates, reranked: true, fallbackReason: 'none' };
}
