import { Injectable } from '@nestjs/common';
import { CampaignRegistry } from './campaign-registry.service';
import { LifecyclePersistenceService } from '../stores/lifecycle-persistence.service';
import { CrossEngineFrequencyService } from '../../owner-communications/cross-engine-frequency.service';
import type { LifecycleCampaignDefinition } from '../types/campaign.types';

export interface FrequencyDecision {
  allowed: boolean;
  reason: string;
}

@Injectable()
export class FrequencyEngine {
  constructor(
    private readonly registry: CampaignRegistry,
    private readonly persistence: LifecyclePersistenceService,
    private readonly crossEngine: CrossEngineFrequencyService,
  ) {}

  async evaluate(
    restaurantId: string,
    campaign: LifecycleCampaignDefinition,
    recommendationCode: string | null,
    recentDeliveryCount: number,
  ): Promise<FrequencyDecision> {
    void recentDeliveryCount;
    if (recommendationCode) {
      const ownership = this.crossEngine.assertEngineOwnership(
        recommendationCode,
        'lifecycle_marketing',
      );
      if (!ownership.allowed) {
        return { allowed: false, reason: ownership.reason };
      }

      const dedup = await this.crossEngine.evaluateRecommendationDedup(
        restaurantId,
        recommendationCode,
        Math.max(
          campaign.cooldownDays,
          this.crossEngine.getGlobalCap().minDaysBetweenSameRecommendation,
        ),
      );
      if (!dedup.allowed) {
        return { allowed: false, reason: dedup.reason };
      }
    }

    const globalCap = this.crossEngine.getGlobalCap();
    const crossCap = await this.crossEngine.evaluateGlobalCap(
      restaurantId,
      Math.max(campaign.cooldownDays, globalCap.days),
    );
    if (!crossCap.allowed) {
      return { allowed: false, reason: crossCap.reason };
    }

    const daysSinceCampaign =
      await this.persistence.daysSinceLastDeliveryForCampaign(
        restaurantId,
        campaign.id,
      );

    if (
      daysSinceCampaign != null &&
      daysSinceCampaign < campaign.cooldownDays
    ) {
      return {
        allowed: false,
        reason: `Cooldown campaña ${campaign.id}: ${daysSinceCampaign}d < ${campaign.cooldownDays}d`,
      };
    }

    const totalForCampaign = await this.persistence.countDeliveriesForCampaign(
      restaurantId,
      campaign.id,
    );
    if (
      campaign.exitConditions.maxDeliveries != null &&
      totalForCampaign >= campaign.exitConditions.maxDeliveries
    ) {
      return {
        allowed: false,
        reason: `Máximo de entregas alcanzado (${totalForCampaign})`,
      };
    }

    return { allowed: true, reason: 'Frecuencia OK' };
  }
}
