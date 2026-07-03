export type CommercialActionType =
  | 'SEND_FIRST_MESSAGE'
  | 'SEND_FOLLOWUP'
  | 'GENERATE_DEMO'
  | 'RE_ANALYZE'
  | 'WAIT'
  | 'NO_ACTION'
  | 'CREATE_GOAL';

export type RecommendationVerdict =
  | 'DO_NOW'
  | 'WAIT'
  | 'SKIP_BUDGET'
  | 'GENERATE_DEMO'
  | 'SKIP_DEMO'
  | 'USE_FLASH'
  | 'NO_ACTION';

export interface CiConfigWeights {
  ev: number;
  roi: number;
  prob: number;
  urgency: number;
  ease: number;
  cost: number;
}

export interface CiConfigThresholds {
  minEvToAct: number;
  minConfidence: number;
  riskWeight: number;
  baseDealValueUsd: number;
  minAutoEvUsd?: number;
  minAutoConfidence?: number;
  maxAutoCostUsd?: number;
  minBudgetRemainingPct?: number;
  importAutoMinScore?: number;
  probabilityWeights: {
    status: number;
    fit: number;
    channel: number;
    recency: number;
  };
  statusScores: Record<string, number>;
}

export type CommercialAutonomyLevel =
  | 'RECOMMEND'
  | 'SUGGEST_GOAL'
  | 'EXPRESS'
  | 'AUTO_EXECUTE';

export type CommercialActionMode = 'record' | 'l1' | 'express' | 'auto';

export type WorkQueueItemKind =
  | 'recommendation'
  | 'signal'
  | 'approval'
  | 'plan_review';

export type WorkQueueItemSource = 'ev' | 'signal' | 'approval' | 'plan';

export interface WorkQueueItemAction {
  key: string;
  label: string;
  mode?: CommercialActionMode;
  href?: string;
}

export interface CommercialWorkQueueItem {
  id: string;
  kind: WorkQueueItemKind;
  sources: WorkQueueItemSource[];
  priority: number;
  leadId?: string;
  leadName?: string;
  title: string;
  subtitle: string;
  recommendation?: ActionIntelligenceResult;
  signal?: OpportunitySignal;
  goalId?: string;
  planId?: string;
  analysisId?: string;
  actions: WorkQueueItemAction[];
}

export interface CommercialWorkQueueDto {
  items: CommercialWorkQueueItem[];
  summary: {
    total: number;
    byKind: Partial<Record<WorkQueueItemKind, number>>;
    actionableCount: number;
    budgetRemainingUsd: number | null;
  };
  generatedAt: string;
}

export interface CommercialIntelligenceConfigData {
  weights: CiConfigWeights;
  segments: Record<string, { multiplier: number }>;
  signals: Record<string, { multiplier: number }>;
  thresholds: CiConfigThresholds;
}

export interface ActionIntelligenceResult {
  actionType: CommercialActionType;
  taskKey?: string;
  targetType: 'lead' | 'global';
  targetId?: string;
  label: string;
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  selectedModel?: string;
  modelSource?: string;
  canReuse: boolean;
  reuseSavingsUsd: number;
  successProbability: number;
  expectedRevenueUsd: number;
  expectedValueUsd: number;
  expectedRoi: number | null;
  confidence: number;
  risk: number;
  priority: number;
  verdict: RecommendationVerdict;
  reason: string;
}

export interface TodayDashboardDto {
  summary: {
    opportunitiesEvaluated: number;
    recommendedCount: number;
    discardedCount: number;
    budgetRemainingUsd: number | null;
    budgetMonthlyLimitUsd: number | null;
    totalExpectedValueUsd: number;
    totalExpectedCostUsd: number;
    aggregateExpectedRoi: number | null;
  };
  recommended: ActionIntelligenceResult[];
  discarded: ActionIntelligenceResult[];
  topImpact: ActionIntelligenceResult[];
  configVersion: number;
}

export type OpportunitySignalType =
  | 'STALE_FOLLOWUP'
  | 'HIGH_INTENT_COOLING'
  | 'HOT_NEW_LEAD'
  | 'PENDING_APPROVAL'
  | 'PLAN_AWAITING_APPROVAL'
  | 'DEMO_CANDIDATE'
  | 'DEMO_VIEWED'
  | 'BUDGET_LOW';

export type OpportunitySignalSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface OpportunitySignal {
  id: string;
  type: OpportunitySignalType;
  severity: OpportunitySignalSeverity;
  title: string;
  description: string;
  leadId?: string;
  leadName?: string;
  detectedAt: string;
  priority: number;
  suggestedTaskKey?: string;
  actionHref?: string;
}

export interface OpportunityFeedDto {
  signals: OpportunitySignal[];
  summary: {
    total: number;
    critical: number;
    high: number;
    byType: Partial<Record<OpportunitySignalType, number>>;
  };
  generatedAt: string;
}

export type DecisionOutcomeStatus =
  | 'converted'
  | 'progressed'
  | 'stalled'
  | 'lost'
  | 'pending'
  | 'unknown';

export interface DecisionOutcomeComparison {
  decisionId: string;
  actionType: string;
  targetId: string | null;
  leadName: string | null;
  goalId: string | null;
  decidedAt: string;
  expectedCostUsd: number;
  expectedValueUsd: number;
  expectedRoi: number | null;
  actualCostUsd: number | null;
  costDeviationUsd: number | null;
  valueRealizedUsd: number | null;
  actualRoi: number | null;
  outcomeStatus: DecisionOutcomeStatus;
  outcomeLabel: string;
  predictionAccuracy: number | null;
}

export interface CommercialLearningSummaryDto {
  summary: {
    decisionsAnalyzed: number;
    converted: number;
    progressed: number;
    stalled: number;
    lost: number;
    pending: number;
    avgCostDeviationUsd: number | null;
    avgExpectedRoi: number | null;
    avgActualRoi: number | null;
    predictionAccuracyAvg: number | null;
  };
  items: DecisionOutcomeComparison[];
}

export const DEFAULT_CI_CONFIG: CommercialIntelligenceConfigData = {
  weights: {
    ev: 0.35,
    roi: 0.25,
    prob: 0.15,
    urgency: 0.1,
    ease: 0.1,
    cost: 0.05,
  },
  segments: {
    standard: { multiplier: 1.0 },
    multi_branch: { multiplier: 1.4 },
    premium: { multiplier: 1.6 },
    high_intent: { multiplier: 2.0 },
    cold: { multiplier: 0.6 },
  },
  signals: {
    no_website: { multiplier: 1.15 },
    no_online_menu: { multiplier: 1.1 },
    has_whatsapp: { multiplier: 1.05 },
    multi_branch: { multiplier: 1.2 },
  },
  thresholds: {
    minEvToAct: 0.01,
    minConfidence: 0.4,
    riskWeight: 0.1,
    baseDealValueUsd: 348,
    minAutoEvUsd: 0.5,
    minAutoConfidence: 0.85,
    maxAutoCostUsd: 0.25,
    minBudgetRemainingPct: 0.2,
    importAutoMinScore: 60,
    probabilityWeights: {
      status: 0.4,
      fit: 0.35,
      channel: 0.15,
      recency: 0.1,
    },
    statusScores: {
      NEW: 0.15,
      ANALYZED: 0.25,
      CONTACTED: 0.35,
      INTERESTED: 0.55,
      MEETING_SCHEDULED: 0.75,
      CLIENT: 1.0,
      LOST: 0.05,
    },
  },
};
