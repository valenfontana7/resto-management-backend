export interface RecommendationEvaluatorRunLog {
  ruleId: string;
  ruleVersion: string;
  recommendationCode: string;
  produced: boolean;
  discarded: boolean;
  discardReason?: string;
  reason: string;
  durationMs: number;
}

export interface RecommendationTransitionLog {
  transition:
    | 'recommendation_created'
    | 'recommendation_discarded'
    | 'recommendation_expired'
    | 'recommendation_superseded'
    | 'recommendation_backlogged';
  recommendationId: string;
  code: string;
  reason: string;
  ruleId: string;
}

export interface RecommendationDecisionLog {
  restaurantId: string;
  evaluatedAt: string;
  catalogVersion: string;
  evaluatorsRun: number;
  evaluatorsProduced: number;
  evaluatorsDiscarded: number;
  runs: RecommendationEvaluatorRunLog[];
  transitions: RecommendationTransitionLog[];
  summary: string;
}

export function createEmptyRecommendationDecisionLog(
  restaurantId: string,
  evaluatedAt: Date,
  catalogVersion: string,
): RecommendationDecisionLog {
  return {
    restaurantId,
    evaluatedAt: evaluatedAt.toISOString(),
    catalogVersion,
    evaluatorsRun: 0,
    evaluatorsProduced: 0,
    evaluatorsDiscarded: 0,
    runs: [],
    transitions: [],
    summary: '',
  };
}
