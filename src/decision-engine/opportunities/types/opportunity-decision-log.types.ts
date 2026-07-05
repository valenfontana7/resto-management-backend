export interface OpportunityEvaluatorRunLog {
  ruleId: string;
  ruleVersion: string;
  opportunityCode: string;
  detected: boolean;
  discarded: boolean;
  discardReason?: string;
  reason: string;
  durationMs: number;
}

export interface OpportunityTransitionLog {
  transition:
    | 'opportunity_opened'
    | 'opportunity_closed'
    | 'opportunity_expired'
    | 'opportunity_backlogged';
  opportunityId: string;
  code: string;
  reason: string;
  ruleId: string;
}

export interface OpportunityDecisionLog {
  restaurantId: string;
  evaluatedAt: string;
  catalogVersion: string;
  evaluatorsRun: number;
  evaluatorsDetected: number;
  evaluatorsDiscarded: number;
  runs: OpportunityEvaluatorRunLog[];
  transitions: OpportunityTransitionLog[];
  summary: string;
}

export function createEmptyOpportunityDecisionLog(
  restaurantId: string,
  evaluatedAt: Date,
  catalogVersion: string,
): OpportunityDecisionLog {
  return {
    restaurantId,
    evaluatedAt: evaluatedAt.toISOString(),
    catalogVersion,
    evaluatorsRun: 0,
    evaluatorsDetected: 0,
    evaluatorsDiscarded: 0,
    runs: [],
    transitions: [],
    summary: '',
  };
}
