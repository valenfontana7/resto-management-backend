import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  LifecycleCampaignCatalogDocument,
  LifecycleCampaignDefinition,
  LifecycleRecommendationBinding,
} from '../types/campaign.types';

let cached: LifecycleCampaignCatalogDocument | null = null;

function loadDocument(): LifecycleCampaignCatalogDocument {
  if (cached) return cached;
  const raw = readFileSync(join(__dirname, 'campaigns.v1.json'), 'utf-8');
  cached = JSON.parse(raw) as LifecycleCampaignCatalogDocument;
  return cached;
}

export function getCampaignCatalog(): LifecycleCampaignCatalogDocument {
  return loadDocument();
}

export function listCampaigns(): LifecycleCampaignDefinition[] {
  return loadDocument().campaigns;
}

export function getCampaignById(
  campaignId: string,
): LifecycleCampaignDefinition | null {
  return loadDocument().campaigns.find((c) => c.id === campaignId) ?? null;
}

export function listRecommendationBindings(): LifecycleRecommendationBinding[] {
  return loadDocument().recommendationBindings;
}

export function resolveCampaignForRecommendation(
  recommendationCode: string,
): LifecycleCampaignDefinition | null {
  const doc = loadDocument();
  const binding = doc.recommendationBindings.find(
    (b) => b.recommendationCode === recommendationCode,
  );
  if (!binding) return null;
  return doc.campaigns.find((c) => c.id === binding.campaignId) ?? null;
}

export function getGlobalFrequencyCap(): {
  days: number;
  maxMessages: number;
} {
  const doc = loadDocument();
  return {
    days: doc.globalFrequencyCapDays,
    maxMessages: doc.globalMaxMessagesPerWindow,
  };
}
