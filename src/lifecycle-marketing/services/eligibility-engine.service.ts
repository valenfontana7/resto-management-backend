import { Injectable } from '@nestjs/common';
import type { DetectedOpportunity } from '../../decision-engine/opportunities/types/opportunity.types';
import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';
import type { RestaurantSuccessSnapshot } from '../../decision-engine/rss/types/restaurant-success-snapshot.types';
import type { RestaurantIntelligenceBundle } from '../../decision-engine/types/restaurant-intelligence-bundle.v1';
import type {
  LifecycleCampaignDefinition,
  LifecycleCampaignEntryConditions,
  LifecycleCampaignEvaluationContext,
  LifecycleCampaignStepDefinition,
  LifecycleRssBand,
} from '../types/campaign.types';

export interface EligibilityResult {
  eligible: boolean;
  intelligenceBacked: boolean;
  recommendationCode: string | null;
  opportunityCode: string | null;
  reason: string;
  selectedStep: LifecycleCampaignStepDefinition | null;
  selectedChannel: string | null;
}

@Injectable()
export class EligibilityEngine {
  evaluate(input: {
    campaign: LifecycleCampaignDefinition;
    bundle: RestaurantIntelligenceBundle;
    snapshot: RestaurantSuccessSnapshot;
    context: LifecycleCampaignEvaluationContext;
    stepIndex?: number;
  }): EligibilityResult {
    const { campaign, bundle, snapshot, context } = input;
    const stepIndex = input.stepIndex ?? 0;

    const recMatch = this.matchRecommendation(
      campaign.entryConditions,
      bundle.recommendations,
    );
    const oppMatch = this.matchOpportunity(
      campaign.entryConditions,
      bundle.opportunities,
    );

    const intelligenceBacked = this.hasIntelligenceBacking(
      campaign.entryConditions,
      snapshot,
      recMatch,
      oppMatch,
    );

    if (!intelligenceBacked) {
      return {
        eligible: false,
        intelligenceBacked: false,
        recommendationCode: recMatch,
        opportunityCode: oppMatch,
        reason:
          'Sin respaldo de inteligencia (REC, OPP o RSS) — no comunicar por tiempo solo',
        selectedStep: null,
        selectedChannel: null,
      };
    }

    if (
      campaign.entryConditions.rssBands?.length &&
      !campaign.entryConditions.rssBands.includes(
        snapshot.rss.band as LifecycleRssBand,
      )
    ) {
      return {
        eligible: false,
        intelligenceBacked: true,
        recommendationCode: recMatch,
        opportunityCode: oppMatch,
        reason: `RSS band ${snapshot.rss.band} fuera de entryConditions`,
        selectedStep: null,
        selectedChannel: null,
      };
    }

    if (
      campaign.entryConditions.minDaysInactive != null &&
      (context.daysSinceLastCampaignDelivery == null ||
        context.daysSinceLastCampaignDelivery <
          campaign.entryConditions.minDaysInactive)
    ) {
      const daysInactive = this.deriveDaysInactive(snapshot);
      if (
        daysInactive == null ||
        daysInactive < campaign.entryConditions.minDaysInactive
      ) {
        return {
          eligible: false,
          intelligenceBacked: true,
          recommendationCode: recMatch,
          opportunityCode: oppMatch,
          reason: `Inactividad ${daysInactive ?? 0}d < mínimo ${campaign.entryConditions.minDaysInactive}d`,
          selectedStep: null,
          selectedChannel: null,
        };
      }
    }

    if (this.isExitMet(campaign, snapshot, context)) {
      return {
        eligible: false,
        intelligenceBacked: true,
        recommendationCode: recMatch,
        opportunityCode: oppMatch,
        reason: 'Condición de salida cumplida',
        selectedStep: null,
        selectedChannel: null,
      };
    }

    if (
      campaign.suppressionRules.respectChampionBlock &&
      snapshot.rss.band === 'champion' &&
      ['ACTIVATION', 'ONBOARDING', 'WELCOME'].includes(campaign.type)
    ) {
      return {
        eligible: false,
        intelligenceBacked: true,
        recommendationCode: recMatch,
        opportunityCode: oppMatch,
        reason: 'Champion block — activación/onboarding suprimido',
        selectedStep: null,
        selectedChannel: null,
      };
    }

    const blockedTypes =
      campaign.suppressionRules.blockIfActiveCampaignTypes ?? [];
    if (blockedTypes.some((t) => context.activeCampaignTypes.includes(t))) {
      return {
        eligible: false,
        intelligenceBacked: true,
        recommendationCode: recMatch,
        opportunityCode: oppMatch,
        reason: `Campaña activa conflictiva: ${blockedTypes.join(', ')}`,
        selectedStep: null,
        selectedChannel: null,
      };
    }

    const step = campaign.steps[stepIndex] ?? campaign.steps[0] ?? null;
    if (!step) {
      return {
        eligible: false,
        intelligenceBacked: true,
        recommendationCode: recMatch,
        opportunityCode: oppMatch,
        reason: 'Sin step definido en campaña',
        selectedStep: null,
        selectedChannel: null,
      };
    }

    return {
      eligible: true,
      intelligenceBacked: true,
      recommendationCode: recMatch,
      opportunityCode: oppMatch,
      reason: 'Elegible para comunicación',
      selectedStep: step,
      selectedChannel: step.channel,
    };
  }

  private hasIntelligenceBacking(
    entry: LifecycleCampaignEntryConditions,
    snapshot: RestaurantSuccessSnapshot,
    recMatch: string | null,
    oppMatch: string | null,
  ): boolean {
    const hasRec =
      recMatch != null ||
      (entry.requiresRecommendationCodes?.length === 0 &&
        entry.requiresOpportunityCodes?.length === 0 &&
        (entry.rssBands?.length ?? 0) > 0);

    const hasOpp = oppMatch != null;
    const hasRss =
      (entry.rssBands?.length ?? 0) > 0 &&
      entry.rssBands!.includes(snapshot.rss.band as LifecycleRssBand);

    if (entry.requiresRecommendationCodes?.length) {
      return recMatch != null || hasRss;
    }
    if (entry.requiresOpportunityCodes?.length) {
      return oppMatch != null || hasRss;
    }
    return hasRec || hasOpp || hasRss;
  }

  private matchRecommendation(
    entry: LifecycleCampaignEntryConditions,
    recommendations: DetectedRecommendation[],
  ): string | null {
    const codes = entry.requiresRecommendationCodes;
    if (!codes?.length) return null;
    const match = recommendations.find((r) => codes.includes(r.code));
    return match?.code ?? null;
  }

  private matchOpportunity(
    entry: LifecycleCampaignEntryConditions,
    opportunities: DetectedOpportunity[],
  ): string | null {
    const codes = entry.requiresOpportunityCodes;
    if (!codes?.length) return null;
    const match = opportunities.find((o) => codes.includes(o.code));
    return match?.code ?? null;
  }

  private isExitMet(
    campaign: LifecycleCampaignDefinition,
    snapshot: RestaurantSuccessSnapshot,
    context: LifecycleCampaignEvaluationContext,
  ): boolean {
    const exit = campaign.exitConditions;
    if (
      exit.rssBands?.length &&
      exit.rssBands.includes(snapshot.rss.band as LifecycleRssBand)
    ) {
      return true;
    }
    if (
      exit.maxDeliveries != null &&
      context.recentDeliveryCount >= exit.maxDeliveries
    ) {
      return true;
    }
    return false;
  }

  private deriveDaysInactive(
    snapshot: RestaurantSuccessSnapshot,
  ): number | null {
    if (snapshot.rss.trend7d === 'down' && snapshot.rss.delta7d != null) {
      return Math.max(7, Math.abs(Math.round(snapshot.rss.delta7d)));
    }
    return null;
  }
}
