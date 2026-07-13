import campaignsCatalogJson from './campaigns.v1.json';
import type {
  LifecycleCampaignCatalogDocument,
  LifecycleCampaignDefinition,
  LifecycleRecommendationBinding,
} from '../types/campaign.types';

const catalog = campaignsCatalogJson as LifecycleCampaignCatalogDocument;

export function getCampaignCatalog(): LifecycleCampaignCatalogDocument {
  return catalog;
}

export function listCampaigns(): LifecycleCampaignDefinition[] {
  return catalog.campaigns;
}

export function getCampaignById(
  campaignId: string,
): LifecycleCampaignDefinition | null {
  return catalog.campaigns.find((c) => c.id === campaignId) ?? null;
}

export function listRecommendationBindings(): LifecycleRecommendationBinding[] {
  return catalog.recommendationBindings;
}

export function resolveCampaignForRecommendation(
  recommendationCode: string,
): LifecycleCampaignDefinition | null {
  const binding = catalog.recommendationBindings.find(
    (b) => b.recommendationCode === recommendationCode,
  );
  if (!binding) return null;
  return catalog.campaigns.find((c) => c.id === binding.campaignId) ?? null;
}

export function getGlobalFrequencyCap(): {
  days: number;
  maxMessages: number;
} {
  return {
    days: catalog.globalFrequencyCapDays,
    maxMessages: catalog.globalMaxMessagesPerWindow,
  };
}
