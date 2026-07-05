import { Injectable } from '@nestjs/common';
import {
  getGlobalEngagementFrequencyCap,
  getPolicyForRecommendationCode,
  listEngagementPolicies,
} from '../catalog/engagement-policy-catalog.loader';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { ActiveJourneyService } from '../services/active-journey.service';
import type {
  EngagementPolicyDecision,
  EngagementPolicyDefinition,
  EngagementPolicyEvaluationContext,
  EngagementPolicyEvaluatorInput,
} from '../types/engagement-policy.types';

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

@Injectable()
export class EngagementPolicyRegistry {
  constructor(
    private readonly persistence: EngagementPersistenceService,
    private readonly activeJourneys: ActiveJourneyService,
  ) {}

  listPolicies(): EngagementPolicyDefinition[] {
    return listEngagementPolicies();
  }

  resolvePolicy(recommendationCode: string): EngagementPolicyDefinition | null {
    return getPolicyForRecommendationCode(recommendationCode);
  }

  async buildEvaluationContext(
    restaurantId: string,
    recommendationCode: string,
    policy: EngagementPolicyDefinition,
  ): Promise<EngagementPolicyEvaluationContext> {
    const globalCap = getGlobalEngagementFrequencyCap();
    const windowMs =
      Math.max(policy.frequencyCapDays, globalCap.days) * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);
    const recent = await this.persistence.listRecentDeliveries(
      restaurantId,
      since,
    );

    return {
      recentDeliveryCount: recent.length,
      lastDeliveryAt: recent[0]?.createdAt ?? null,
      sameRecommendationSentWithinDays:
        await this.persistence.daysSinceLastDeliveryForRecommendation(
          restaurantId,
          recommendationCode,
        ),
    };
  }

  async evaluate(
    input: EngagementPolicyEvaluatorInput,
  ): Promise<EngagementPolicyDecision> {
    const { recommendation, snapshot, policy, context } = input;

    const minRank = PRIORITY_RANK[policy.minPriority] ?? 0;
    const recRank = PRIORITY_RANK[recommendation.priority] ?? 0;
    if (recRank < minRank) {
      return this.decision(
        policy,
        recommendation.code,
        false,
        `Prioridad ${recommendation.priority} por debajo del mínimo ${policy.minPriority}`,
        false,
        false,
      );
    }

    const championBlocked =
      policy.respectChampionBlock &&
      snapshot.rss.band === 'champion' &&
      recommendation.recommendedJourneyType === 'activation';

    if (championBlocked) {
      return this.decision(
        policy,
        recommendation.code,
        false,
        'Champion: activación básica bloqueada por policy',
        false,
        true,
      );
    }

    if (
      policy.journeyTypeHint === 'activation' &&
      (await this.activeJourneys.hasActiveRiskJourney(
        input.snapshot.restaurantId,
      ))
    ) {
      return this.decision(
        policy,
        recommendation.code,
        false,
        'Journey de riesgo activo — pausa activación (CS RFC)',
        false,
        false,
      );
    }

    const globalCap = getGlobalEngagementFrequencyCap();
    const capDays = Math.max(policy.frequencyCapDays, globalCap.days);
    const capMax = Math.min(policy.maxMessagesPerWindow, globalCap.maxMessages);

    if (context.recentDeliveryCount >= capMax) {
      return this.decision(
        policy,
        recommendation.code,
        false,
        `Frequency cap: ${context.recentDeliveryCount}/${capMax} en ${capDays}d`,
        true,
        false,
      );
    }

    if (
      context.sameRecommendationSentWithinDays != null &&
      context.sameRecommendationSentWithinDays <
        policy.minDaysSinceRecommendation
    ) {
      return this.decision(
        policy,
        recommendation.code,
        false,
        `REC ${recommendation.code} contactada hace ${context.sameRecommendationSentWithinDays}d`,
        true,
        false,
      );
    }

    return this.decision(
      policy,
      recommendation.code,
      true,
      `Policy ${policy.id} aplica a ${recommendation.code}`,
      false,
      false,
    );
  }

  private decision(
    policy: EngagementPolicyDefinition,
    code: string,
    shouldCommunicate: boolean,
    reason: string,
    frequencyCapApplied: boolean,
    championBlocked: boolean,
  ): EngagementPolicyDecision {
    return {
      policyId: policy.id,
      shouldCommunicate,
      reason,
      matchedRecommendationCode: code,
      frequencyCapApplied,
      championBlocked,
    };
  }
}
