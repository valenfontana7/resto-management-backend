import engagementPoliciesCatalogJson from './engagement-policies.v1.json';
import type { EngagementPolicyDefinition } from '../types/engagement-policy.types';

interface EngagementPolicyCatalogFile {
  version: string;
  globalFrequencyCapDays: number;
  globalMaxMessagesPerWindow: number;
  policies: EngagementPolicyDefinition[];
}

const catalog = engagementPoliciesCatalogJson as EngagementPolicyCatalogFile;

export function loadEngagementPolicyCatalog(): EngagementPolicyCatalogFile {
  return catalog;
}

export function getPolicyForRecommendationCode(
  code: string,
): EngagementPolicyDefinition | null {
  return (
    catalog.policies.find((p) => p.recommendationCodes.includes(code)) ?? null
  );
}

export function listEngagementPolicies(): EngagementPolicyDefinition[] {
  return catalog.policies;
}

export function getGlobalEngagementFrequencyCap(): {
  days: number;
  maxMessages: number;
} {
  return {
    days: catalog.globalFrequencyCapDays,
    maxMessages: catalog.globalMaxMessagesPerWindow,
  };
}
