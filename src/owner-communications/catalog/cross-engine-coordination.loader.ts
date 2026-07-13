import crossEngineCoordinationJson from './cross-engine-coordination.v1.json';

export type OwnerCommunicationEngine =
  | 'lifecycle_marketing'
  | 'customer_engagement';

export interface RecommendationOwnershipRule {
  recommendationCode: string;
  primaryEngine: OwnerCommunicationEngine;
  reason: string;
}

export interface CrossEngineCoordinationDocument {
  version: string;
  globalFrequencyCapDays: number;
  globalMaxMessagesPerWindow: number;
  minDaysBetweenSameRecommendation: number;
  countableDeliveryStatuses: string[];
  recommendationOwnership: RecommendationOwnershipRule[];
}

const catalog = crossEngineCoordinationJson as CrossEngineCoordinationDocument;

export function loadCrossEngineCoordination(): CrossEngineCoordinationDocument {
  return catalog;
}

export function getCrossEngineGlobalCap(): {
  days: number;
  maxMessages: number;
  minDaysBetweenSameRecommendation: number;
} {
  return {
    days: catalog.globalFrequencyCapDays,
    maxMessages: catalog.globalMaxMessagesPerWindow,
    minDaysBetweenSameRecommendation: catalog.minDaysBetweenSameRecommendation,
  };
}

export function getRecommendationOwnership(
  recommendationCode: string,
): RecommendationOwnershipRule | null {
  return (
    catalog.recommendationOwnership.find(
      (r) => r.recommendationCode === recommendationCode,
    ) ?? null
  );
}

export function getCountableDeliveryStatuses(): string[] {
  return catalog.countableDeliveryStatuses;
}
