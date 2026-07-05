import { readFileSync } from 'fs';
import { join } from 'path';

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

let cached: CrossEngineCoordinationDocument | null = null;

export function loadCrossEngineCoordination(): CrossEngineCoordinationDocument {
  if (cached) return cached;
  const raw = readFileSync(
    join(__dirname, 'cross-engine-coordination.v1.json'),
    'utf-8',
  );
  cached = JSON.parse(raw) as CrossEngineCoordinationDocument;
  return cached;
}

export function getCrossEngineGlobalCap(): {
  days: number;
  maxMessages: number;
  minDaysBetweenSameRecommendation: number;
} {
  const doc = loadCrossEngineCoordination();
  return {
    days: doc.globalFrequencyCapDays,
    maxMessages: doc.globalMaxMessagesPerWindow,
    minDaysBetweenSameRecommendation: doc.minDaysBetweenSameRecommendation,
  };
}

export function getRecommendationOwnership(
  recommendationCode: string,
): RecommendationOwnershipRule | null {
  const doc = loadCrossEngineCoordination();
  return (
    doc.recommendationOwnership.find(
      (r) => r.recommendationCode === recommendationCode,
    ) ?? null
  );
}

export function getCountableDeliveryStatuses(): string[] {
  return loadCrossEngineCoordination().countableDeliveryStatuses;
}
