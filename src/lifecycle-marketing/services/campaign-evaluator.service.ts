import { Injectable } from '@nestjs/common';
import { CampaignRegistry } from './campaign-registry.service';
import { CampaignOverrideService } from './campaign-override.service';
import { EligibilityEngine } from './eligibility-engine.service';
import { FrequencyEngine } from './frequency-engine.service';
import { LifecyclePersistenceService } from '../stores/lifecycle-persistence.service';
import type { RestaurantIntelligenceBundle } from '../../decision-engine/types/restaurant-intelligence-bundle.v1';
import type {
  LifecycleCampaignDefinition,
  LifecycleCampaignEvaluationResult,
} from '../types/campaign.types';

@Injectable()
export class CampaignEvaluator {
  constructor(
    private readonly registry: CampaignRegistry,
    private readonly campaignOverrides: CampaignOverrideService,
    private readonly eligibility: EligibilityEngine,
    private readonly frequency: FrequencyEngine,
    private readonly persistence: LifecyclePersistenceService,
  ) {}

  async evaluateCampaign(input: {
    campaign: LifecycleCampaignDefinition;
    bundle: RestaurantIntelligenceBundle;
    stepIndex?: number;
  }): Promise<LifecycleCampaignEvaluationResult> {
    const { campaign, bundle } = input;
    const snapshot = bundle.snapshot!;

    if (await this.campaignOverrides.isPaused(campaign.id)) {
      return {
        campaignId: campaign.id,
        campaignType: campaign.type,
        eligible: false,
        shouldCommunicate: false,
        reason: 'Campaña pausada desde Marketing Hub',
        intelligenceBacked: true,
        recommendationCode: null,
        opportunityCode: null,
        selectedStep: null,
        selectedChannel: null,
        selectedTemplateId: null,
      };
    }

    const activeCampaignTypes = await this.persistence.listActiveCampaignTypes(
      snapshot.restaurantId,
    );
    const recent = await this.persistence.listRecentDeliveries(
      snapshot.restaurantId,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    );
    const campaignDeliveries = recent.filter(
      (d) => d.campaignId === campaign.id,
    );

    const context = {
      restaurantId: snapshot.restaurantId,
      recentDeliveryCount: campaignDeliveries.length,
      lastDeliveryAt: campaignDeliveries[0]?.createdAt ?? null,
      daysSinceLastCampaignDelivery:
        campaignDeliveries[0] != null
          ? Math.floor(
              (Date.now() - campaignDeliveries[0].createdAt.getTime()) /
                (24 * 60 * 60 * 1000),
            )
          : null,
      activeCampaignTypes,
    };

    const eligibilityResult = this.eligibility.evaluate({
      campaign,
      bundle,
      snapshot,
      context,
      stepIndex: input.stepIndex,
    });

    if (!eligibilityResult.eligible) {
      return {
        campaignId: campaign.id,
        campaignType: campaign.type,
        eligible: false,
        shouldCommunicate: false,
        reason: eligibilityResult.reason,
        intelligenceBacked: eligibilityResult.intelligenceBacked,
        recommendationCode: eligibilityResult.recommendationCode,
        opportunityCode: eligibilityResult.opportunityCode,
        selectedStep: null,
        selectedChannel: null,
        selectedTemplateId: null,
      };
    }

    const freq = await this.frequency.evaluate(
      snapshot.restaurantId,
      campaign,
      eligibilityResult.recommendationCode,
      recent.length,
    );

    if (!freq.allowed) {
      return {
        campaignId: campaign.id,
        campaignType: campaign.type,
        eligible: true,
        shouldCommunicate: false,
        reason: freq.reason,
        intelligenceBacked: true,
        recommendationCode: eligibilityResult.recommendationCode,
        opportunityCode: eligibilityResult.opportunityCode,
        selectedStep: eligibilityResult.selectedStep,
        selectedChannel:
          eligibilityResult.selectedChannel as LifecycleCampaignEvaluationResult['selectedChannel'],
        selectedTemplateId: eligibilityResult.selectedStep?.templateId ?? null,
      };
    }

    const step = eligibilityResult.selectedStep!;
    const alreadySent = await this.persistence.hasCampaignStepDelivery(
      snapshot.restaurantId,
      campaign.id,
      step.stepId,
    );
    if (alreadySent) {
      return {
        campaignId: campaign.id,
        campaignType: campaign.type,
        eligible: true,
        shouldCommunicate: false,
        reason: `Step ${step.stepId} ya enviado o programado`,
        intelligenceBacked: true,
        recommendationCode: eligibilityResult.recommendationCode,
        opportunityCode: eligibilityResult.opportunityCode,
        selectedStep: step,
        selectedChannel: step.channel,
        selectedTemplateId: step.templateId,
      };
    }

    return {
      campaignId: campaign.id,
      campaignType: campaign.type,
      eligible: true,
      shouldCommunicate: true,
      reason: 'Comunicar — elegible y dentro de frecuencia',
      intelligenceBacked: true,
      recommendationCode: eligibilityResult.recommendationCode,
      opportunityCode: eligibilityResult.opportunityCode,
      selectedStep: step,
      selectedChannel: step.channel,
      selectedTemplateId: step.templateId,
    };
  }

  async evaluateForRecommendation(
    bundle: RestaurantIntelligenceBundle,
    recommendationCode: string,
  ): Promise<LifecycleCampaignEvaluationResult | null> {
    const campaign = this.registry.resolveForRecommendation(recommendationCode);
    if (!campaign) return null;
    return this.evaluateCampaign({ campaign, bundle });
  }

  async evaluateOpportunityCampaigns(
    bundle: RestaurantIntelligenceBundle,
  ): Promise<LifecycleCampaignEvaluationResult[]> {
    if (!bundle.snapshot) return [];
    const results: LifecycleCampaignEvaluationResult[] = [];

    for (const campaign of this.registry.listCampaigns()) {
      const needsOpp =
        campaign.entryConditions.requiresOpportunityCodes?.length;
      const needsRecOnly =
        !needsOpp &&
        !campaign.entryConditions.requiresRecommendationCodes?.length &&
        (campaign.entryConditions.rssBands?.length ?? 0) > 0;

      if (needsOpp || needsRecOnly) {
        const evalResult = await this.evaluateCampaign({ campaign, bundle });
        if (evalResult.shouldCommunicate) {
          results.push(evalResult);
        }
      }
    }

    return results.sort(
      (a, b) =>
        (this.registry.getCampaign(b.campaignId)?.priority ?? 0) -
        (this.registry.getCampaign(a.campaignId)?.priority ?? 0),
    );
  }
}
