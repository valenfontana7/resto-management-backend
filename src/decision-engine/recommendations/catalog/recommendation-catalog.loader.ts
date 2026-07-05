import recommendationsCatalogJson from './recommendations.v1.json';
import type { RecommendationStrategyId } from './strategy-catalog.loader';
import type { OpportunityCodeValue } from '../../opportunities/catalog/opportunity-catalog.loader';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';
export type RecommendationConfidence = 'high' | 'medium' | 'low';
export type RecommendationEffort = 'minutes' | 'hours' | 'project';

export interface EstimatedImpact {
  rssDeltaRange: string;
  outcome: string;
  timeframe: string;
}

export interface ConsumerHints {
  journeyId?: string;
  playbookId?: string;
  taskType?: string;
}

export interface RecommendationCatalogEntry {
  code: string;
  strategy: RecommendationStrategyId;
  sourceOpportunityCode: OpportunityCodeValue | null;
  supportingSignalPattern?: string;
  requiresSnapshotSignalCodes?: string[];
  basePriority: RecommendationPriority;
  title: string;
  summary: string;
  whyTemplate: string;
  primaryJob: string;
  expectedOutcome: string;
  recommendedJourneyType: string;
  estimatedImpact: EstimatedImpact;
  estimatedEffort: RecommendationEffort;
  consumerHints: ConsumerHints;
  championBlocked: boolean;
  principles: string[];
  ruleId: string;
}

export interface RecommendationCatalog {
  version: string;
  maxActive: number;
  maxCriticalActive: number;
  defaultExpireDays: number;
  links: Record<string, string[]>;
  recommendations: Record<string, RecommendationCatalogEntry>;
}

const catalog = recommendationsCatalogJson as RecommendationCatalog;

/** Central registry of recommendation codes — never use string literals elsewhere. */
export const RecommendationCode = {
  REC_PUB_01: 'REC-PUB-01',
  REC_MNU_01: 'REC-MNU-01',
  REC_PAY_01: 'REC-PAY-01',
  REC_TST_01: 'REC-TST-01',
  REC_CHK_01: 'REC-CHK-01',
  REC_REA_01: 'REC-REA-01',
  REC_SAV_01: 'REC-SAV-01',
  REC_FIX_01: 'REC-FIX-01',
  REC_2PL_01: 'REC-2PL-01',
  REC_INV_01: 'REC-INV-01',
  REC_GOL_01: 'REC-GOL-01',
  REC_TRI_01: 'REC-TRI-01',
  REC_GRW_01: 'REC-GRW-01',
  REC_CEL_01: 'REC-CEL-01',
} as const;

export type RecommendationCodeValue =
  (typeof RecommendationCode)[keyof typeof RecommendationCode];

export function getRecommendationCatalog(): RecommendationCatalog {
  return catalog;
}

export function getRecommendationCatalogEntry(
  code: RecommendationCodeValue,
): RecommendationCatalogEntry {
  const entry = catalog.recommendations[code];
  if (!entry) {
    throw new Error(`Unknown recommendation code in catalog: ${code}`);
  }
  return entry;
}

export function getRecommendationCatalogVersion(): string {
  return catalog.version;
}

export function getMaxActiveRecommendations(): number {
  return catalog.maxActive;
}

export function getMaxCriticalRecommendations(): number {
  return catalog.maxCriticalActive;
}

export function getRecommendationExpireDays(): number {
  return catalog.defaultExpireDays;
}

export function getLinkedRecommendationCodes(
  opportunityCode: string,
): RecommendationCodeValue[] {
  return (catalog.links[opportunityCode] ?? []) as RecommendationCodeValue[];
}

export function listRecommendationCodes(): RecommendationCodeValue[] {
  return Object.values(RecommendationCode);
}
