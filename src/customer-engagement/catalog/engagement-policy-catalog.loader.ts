import { readFileSync } from 'fs';
import { join } from 'path';
import type { EngagementPolicyDefinition } from '../types/engagement-policy.types';

interface EngagementPolicyCatalogFile {
  version: string;
  globalFrequencyCapDays: number;
  globalMaxMessagesPerWindow: number;
  policies: EngagementPolicyDefinition[];
}

let cached: EngagementPolicyCatalogFile | null = null;

export function loadEngagementPolicyCatalog(): EngagementPolicyCatalogFile {
  if (cached) return cached;
  const path = join(__dirname, 'engagement-policies.v1.json');
  cached = JSON.parse(
    readFileSync(path, 'utf-8'),
  ) as EngagementPolicyCatalogFile;
  return cached;
}

export function getPolicyForRecommendationCode(
  code: string,
): EngagementPolicyDefinition | null {
  const catalog = loadEngagementPolicyCatalog();
  return (
    catalog.policies.find((p) => p.recommendationCodes.includes(code)) ?? null
  );
}

export function listEngagementPolicies(): EngagementPolicyDefinition[] {
  return loadEngagementPolicyCatalog().policies;
}

export function getGlobalEngagementFrequencyCap(): {
  days: number;
  maxMessages: number;
} {
  const catalog = loadEngagementPolicyCatalog();
  return {
    days: catalog.globalFrequencyCapDays,
    maxMessages: catalog.globalMaxMessagesPerWindow,
  };
}
