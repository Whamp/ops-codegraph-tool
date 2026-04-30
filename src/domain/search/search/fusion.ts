export type FusionSource = 'bm25' | 'bm25_variant' | 'vector' | 'vector_variant' | 'hyde';

export type FusionStage = 'bm25' | 'vector';

export type FusionWeights = Partial<Record<FusionSource, number>>;

export interface WeightedRrfConfig {
  k: number;
  weights: FusionWeights;
  topRankBonus: number;
  topRankThreshold: number;
  nearTopRankBonusMultiplier: number;
}

export interface RankedFusionResult<TPayload = unknown> {
  key: string;
  rank: number;
  payload?: TPayload;
}

export interface RankedFusionInput<TPayload = unknown> {
  source: FusionSource;
  query: string;
  results: RankedFusionResult<TPayload>[];
}

export interface FusionSourceContribution {
  source: FusionSource;
  stage: FusionStage;
  query: string;
  rank: number;
  weight: number;
  contribution: number;
}

export interface FusionExplain {
  sources: FusionSourceContribution[];
  topRankBonus: number;
}

export interface FusedResult<TPayload = unknown> {
  key: string;
  score: number;
  bm25Rank: number | null;
  semanticRank: number | null;
  payload?: TPayload;
  explain: FusionExplain;
}

interface FusionAccumulator<TPayload> {
  key: string;
  score: number;
  bm25Rank: number | null;
  semanticRank: number | null;
  payload?: TPayload;
  sources: FusionSourceContribution[];
  topRankBonus: number;
}

export function fusionStage(source: FusionSource): FusionStage {
  return source === 'bm25' || source === 'bm25_variant' ? 'bm25' : 'vector';
}

function contribution(rank: number, k: number, weight: number): number {
  return weight / (k + rank);
}

function weightForSource(source: FusionSource, weights: FusionWeights): number {
  return weights[source] ?? 1;
}

function compareByScoreThenKey<TPayload>(
  a: FusedResult<TPayload>,
  b: FusedResult<TPayload>,
): number {
  const scoreDiff = b.score - a.score;
  if (Math.abs(scoreDiff) > 1e-12) return scoreDiff;
  return a.key.localeCompare(b.key);
}

export function weightedRrfFuse<TPayload = unknown>(
  inputs: RankedFusionInput<TPayload>[],
  config: WeightedRrfConfig,
): FusedResult<TPayload>[] {
  const candidates = new Map<string, FusionAccumulator<TPayload>>();

  for (const input of inputs) {
    const sourceWeight = weightForSource(input.source, config.weights);
    const stage = fusionStage(input.source);
    for (const result of input.results) {
      let candidate = candidates.get(result.key);
      if (!candidate) {
        candidate = {
          key: result.key,
          score: 0,
          bm25Rank: null,
          semanticRank: null,
          payload: result.payload,
          sources: [],
          topRankBonus: 0,
        };
        candidates.set(result.key, candidate);
      }
      if (candidate.payload === undefined && result.payload !== undefined) {
        candidate.payload = result.payload;
      }

      const amount = contribution(result.rank, config.k, sourceWeight);
      candidate.score += amount;
      candidate.sources.push({
        source: input.source,
        stage,
        query: input.query,
        rank: result.rank,
        weight: sourceWeight,
        contribution: amount,
      });

      if (stage === 'bm25') {
        if (candidate.bm25Rank === null || result.rank < candidate.bm25Rank) {
          candidate.bm25Rank = result.rank;
        }
      } else if (candidate.semanticRank === null || result.rank < candidate.semanticRank) {
        candidate.semanticRank = result.rank;
      }
    }
  }

  for (const candidate of candidates.values()) {
    const ranks = [candidate.bm25Rank, candidate.semanticRank].filter(
      (rank): rank is number => rank !== null,
    );
    if (ranks.some((rank) => rank === 1)) {
      candidate.topRankBonus = config.topRankBonus;
    } else if (ranks.some((rank) => rank <= config.topRankThreshold)) {
      candidate.topRankBonus = config.topRankBonus * config.nearTopRankBonusMultiplier;
    }
    candidate.score += candidate.topRankBonus;
  }

  return [...candidates.values()]
    .map((candidate) => ({
      key: candidate.key,
      score: candidate.score,
      bm25Rank: candidate.bm25Rank,
      semanticRank: candidate.semanticRank,
      payload: candidate.payload,
      explain: {
        sources: candidate.sources,
        topRankBonus: candidate.topRankBonus,
      },
    }))
    .sort(compareByScoreThenKey);
}
