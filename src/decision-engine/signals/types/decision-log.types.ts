export interface EvaluatorRunLog {
  ruleId: string;
  ruleVersion: string;
  signalCode: string | null;
  fired: boolean;
  expiredCodes: string[];
  reason: string;
  durationMs: number;
}

export interface SignalDecisionLog {
  restaurantId: string;
  evaluatedAt: string;
  ruleCatalogVersion: string;
  evaluatorsRun: number;
  evaluatorsFired: number;
  runs: EvaluatorRunLog[];
  summary: string;
}

export function createEmptyDecisionLog(
  restaurantId: string,
  evaluatedAt: Date,
  ruleCatalogVersion: string,
): SignalDecisionLog {
  return {
    restaurantId,
    evaluatedAt: evaluatedAt.toISOString(),
    ruleCatalogVersion,
    evaluatorsRun: 0,
    evaluatorsFired: 0,
    runs: [],
    summary: '',
  };
}
