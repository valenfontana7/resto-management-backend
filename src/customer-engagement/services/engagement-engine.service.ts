import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DecisionEngineOrchestratorService } from '../../decision-engine/decision-engine-orchestrator.service';
import { EngagementPolicyRegistry } from '../policies/engagement-policy.registry';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { ActiveJourneyService } from './active-journey.service';
import { EngagementContextLoader } from './engagement-context.loader';
import { JourneySelector } from './journey-selector.service';
import { ChannelSelector } from './channel-selector.service';
import { TemplateSelector } from './template-selector.service';
import { PersonalizationEngine } from './personalization-engine.service';
import { DeliveryScheduler } from './delivery-scheduler.service';
import { OutcomeTracker } from './outcome-tracker.service';
import {
  CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
  type EngagementDecision,
  type EngagementPlanResult,
  type EngagementProcessInput,
} from '../types/engagement.types';
import { resolveEngagementRecipient } from '../lib/engagement-recipient.util';

@Injectable()
export class EngagementEngineService {
  private readonly logger = new Logger(EngagementEngineService.name);

  constructor(
    private readonly orchestrator: DecisionEngineOrchestratorService,
    private readonly policyRegistry: EngagementPolicyRegistry,
    private readonly journeySelector: JourneySelector,
    private readonly channelSelector: ChannelSelector,
    private readonly templateSelector: TemplateSelector,
    private readonly personalizationEngine: PersonalizationEngine,
    private readonly deliveryScheduler: DeliveryScheduler,
    private readonly outcomeTracker: OutcomeTracker,
    private readonly contextLoader: EngagementContextLoader,
    private readonly persistence: EngagementPersistenceService,
    private readonly activeJourneys: ActiveJourneyService,
  ) {}

  async planForRestaurant(
    restaurantId: string,
    options?: { dryRun?: boolean; refreshIntelligence?: boolean },
  ): Promise<EngagementPlanResult> {
    const bundle = await this.orchestrator.getSnapshot(restaurantId, {
      refresh: options?.refreshIntelligence ?? false,
    });

    if (!bundle || bundle.status !== 'ready' || !bundle.snapshot) {
      return {
        contractVersion: CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
        restaurantId,
        computedAt: new Date().toISOString(),
        bundleStatus: bundle?.status ?? 'none',
        recommendationsConsidered: 0,
        decisions: [],
        scheduledDeliveries: [],
        skipped: [
          {
            recommendationCode: '*',
            reason: 'Intelligence bundle no disponible',
          },
        ],
      };
    }

    const decisions: EngagementDecision[] = [];
    const scheduledDeliveries: EngagementPlanResult['scheduledDeliveries'] = [];
    const skipped: EngagementPlanResult['skipped'] = [];

    for (const recommendation of bundle.recommendations) {
      const personalization =
        await this.contextLoader.loadPersonalizationContext(
          restaurantId,
          bundle.snapshot,
          recommendation,
        );

      const decision = await this.processRecommendation({
        restaurantId,
        recommendation,
        snapshot: bundle.snapshot,
        bundle,
        personalization,
        dryRun: options?.dryRun ?? false,
      });

      if (!decision) {
        skipped.push({
          recommendationCode: recommendation.code,
          reason: 'Sin policy de engagement para esta REC',
        });
        continue;
      }

      decisions.push(decision);

      if (!decision.shouldCommunicate) {
        skipped.push({
          recommendationCode: recommendation.code,
          reason: decision.policy.reason,
        });
        continue;
      }

      if (decision.delivery) {
        scheduledDeliveries.push(decision.delivery);
        if (!options?.dryRun) {
          await this.outcomeTracker.registerPending(decision.delivery.id);
        }
      }
    }

    return {
      contractVersion: CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
      restaurantId,
      computedAt: new Date().toISOString(),
      bundleStatus: bundle.status,
      recommendationsConsidered: bundle.recommendations.length,
      decisions,
      scheduledDeliveries,
      skipped,
    };
  }

  async processRecommendation(
    input: EngagementProcessInput,
  ): Promise<EngagementDecision | null> {
    const { recommendation, snapshot, bundle, personalization, dryRun } = input;

    const policy = this.policyRegistry.resolvePolicy(recommendation.code);
    if (!policy) {
      return null;
    }

    const evalContext = await this.policyRegistry.buildEvaluationContext(
      input.restaurantId,
      recommendation.code,
      policy,
    );

    const policyDecision = await this.policyRegistry.evaluate({
      recommendation,
      snapshot,
      policy,
      context: evalContext,
    });

    const decisionId = randomUUID();
    const trace = {
      engineVersion: CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
      bundleComputedAt: bundle.computedAt,
      signalIds: [...recommendation.signalIds],
      opportunityIds: [...recommendation.opportunityIds],
      principles: [...recommendation.principles],
      explanationSummary: bundle.explanation?.score.headline ?? null,
    };

    const baseDecision = {
      id: decisionId,
      restaurantId: input.restaurantId,
      recommendationId: recommendation.id,
      recommendationCode: recommendation.code,
      decidedAt: new Date().toISOString(),
      trace,
    };

    if (!dryRun) {
      await this.persistence.saveDecision({
        id: decisionId,
        restaurantId: input.restaurantId,
        recommendationId: recommendation.id,
        recommendationCode: recommendation.code,
        policyId: policy.id,
        shouldCommunicate: policyDecision.shouldCommunicate,
        policyReason: policyDecision.reason,
        journeyId: null,
        channel: null,
        templateId: null,
        trace,
        engineVersion: CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
      });
    }

    if (!policyDecision.shouldCommunicate) {
      return {
        ...baseDecision,
        shouldCommunicate: false,
        policy: policyDecision,
        journey: null,
        channel: null,
        templateId: null,
        message: null,
        delivery: null,
      };
    }

    const journey = this.journeySelector.select(recommendation);
    if (!journey) {
      return {
        ...baseDecision,
        shouldCommunicate: false,
        policy: {
          ...policyDecision,
          shouldCommunicate: false,
          reason: 'Sin journey mapeado para la REC',
        },
        journey: null,
        channel: null,
        templateId: null,
        message: null,
        delivery: null,
      };
    }

    const channel = this.channelSelector.select(journey, policy);
    const template = this.templateSelector.select({
      recommendationCode: recommendation.code,
      journey,
      channel,
    });

    if (!template) {
      return {
        ...baseDecision,
        shouldCommunicate: false,
        policy: {
          ...policyDecision,
          shouldCommunicate: false,
          reason: `Sin template para trigger ${journey.currentStep.templateTrigger}`,
        },
        journey,
        channel,
        templateId: null,
        message: null,
        delivery: null,
      };
    }

    const message = this.personalizationEngine.render(
      template,
      channel,
      personalization,
    );

    if (!dryRun) {
      await this.activeJourneys.startOrUpdateJourney(
        input.restaurantId,
        journey,
      );
    }

    const { delivery } = await this.deliveryScheduler.schedule({
      restaurantId: input.restaurantId,
      decisionId,
      recommendationId: recommendation.id,
      recommendationCode: recommendation.code,
      policyId: policy.id,
      journeyId: journey.journeyId,
      journeyStepId: journey.currentStep.stepId,
      templateId: template.id,
      channel,
      message,
      delayDays: journey.currentStep.delayDays,
      recipient: resolveEngagementRecipient(channel, personalization),
      restaurantName: personalization.restaurantName,
      dryRun,
    });

    this.logger.debug(
      `Engagement ${decisionId}: REC ${recommendation.code} → ${channel} via ${template.id}`,
    );

    return {
      ...baseDecision,
      shouldCommunicate: true,
      policy: policyDecision,
      journey,
      channel,
      templateId: template.id,
      message,
      delivery,
    };
  }

  listDeliveries(restaurantId: string) {
    return this.persistence.listDeliveriesForRestaurant(restaurantId);
  }

  listOutcomes(restaurantId: string) {
    return this.outcomeTracker.listForRestaurant(restaurantId);
  }

  listActiveJourneys(restaurantId: string) {
    return this.activeJourneys.listActiveForRestaurant(restaurantId);
  }

  getDashboardStats(days = 7) {
    return this.persistence.getDashboardStats(days);
  }

  listRecentDeliveriesGlobal(limit = 30) {
    return this.persistence.listRecentDeliveriesGlobal(limit);
  }

  listPolicies() {
    return this.policyRegistry.listPolicies();
  }
}
