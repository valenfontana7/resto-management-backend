import { Injectable } from '@nestjs/common';
import {
  getCampaignById,
  getCampaignCatalog,
  getGlobalFrequencyCap,
  listCampaigns,
  listRecommendationBindings,
  resolveCampaignForRecommendation,
} from '../catalog/campaign-catalog.loader';
import type {
  LifecycleCampaignDefinition,
  LifecycleRecommendationBinding,
} from '../types/campaign.types';

@Injectable()
export class CampaignRegistry {
  listCampaigns(): LifecycleCampaignDefinition[] {
    return listCampaigns();
  }

  listBindings(): LifecycleRecommendationBinding[] {
    return listRecommendationBindings();
  }

  getCampaign(campaignId: string): LifecycleCampaignDefinition | null {
    return getCampaignById(campaignId);
  }

  resolveForRecommendation(
    recommendationCode: string,
  ): LifecycleCampaignDefinition | null {
    return resolveCampaignForRecommendation(recommendationCode);
  }

  getGlobalFrequencyCap(): { days: number; maxMessages: number } {
    return getGlobalFrequencyCap();
  }

  getCatalogVersion(): string {
    return getCampaignCatalog().version;
  }

  listCampaignsByType(type: string): LifecycleCampaignDefinition[] {
    return listCampaigns().filter((c) => c.type === type);
  }
}
