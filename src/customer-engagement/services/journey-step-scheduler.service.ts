import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getJourneyById } from '../catalog/journey-catalog.loader';
import { resolveEngagementRecipient } from '../lib/engagement-recipient.util';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { ActiveJourneyService } from './active-journey.service';
import { EngagementContextLoader } from './engagement-context.loader';
import { JourneySelector } from './journey-selector.service';
import { TemplateSelector } from './template-selector.service';
import { PersonalizationEngine } from './personalization-engine.service';
import { DeliveryScheduler } from './delivery-scheduler.service';
import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';
import type { RestaurantSuccessSnapshot } from '../../decision-engine/rss/types/restaurant-success-snapshot.types';
import { CUSTOMER_ENGAGEMENT_ENGINE_VERSION } from '../types/engagement.types';

@Injectable()
export class JourneyStepSchedulerService {
  private readonly logger = new Logger(JourneyStepSchedulerService.name);

  constructor(
    private readonly persistence: EngagementPersistenceService,
    private readonly activeJourneys: ActiveJourneyService,
    private readonly contextLoader: EngagementContextLoader,
    private readonly journeySelector: JourneySelector,
    private readonly templateSelector: TemplateSelector,
    private readonly personalizationEngine: PersonalizationEngine,
    @Inject(forwardRef(() => DeliveryScheduler))
    private readonly deliveryScheduler: DeliveryScheduler,
  ) {}

  /**
   * Tras enviar un paso, programa el siguiente del catálogo J-* (Journey Engine lite).
   */
  async scheduleNextStepAfterDelivery(input: {
    id: string;
    restaurantId: string;
    decisionId: string | null;
    recommendationId: string;
    recommendationCode: string;
    policyId: string;
    journeyId: string;
    journeyStepId: string;
    restaurantName?: string | null;
  }): Promise<void> {
    const journey = getJourneyById(input.journeyId);
    if (!journey) return;

    const currentIndex = journey.steps.findIndex(
      (step) => step.stepId === input.journeyStepId,
    );
    if (currentIndex < 0) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= journey.steps.length) {
      await this.activeJourneys.completeJourney(
        input.restaurantId,
        input.journeyId,
      );
      this.logger.debug(
        `Journey ${input.journeyId} completed for ${input.restaurantId}`,
      );
      return;
    }

    const nextStep = journey.steps[nextIndex];
    const alreadyScheduled = await this.persistence.hasJourneyStepDelivery(
      input.restaurantId,
      input.journeyId,
      nextStep.stepId,
    );
    if (alreadyScheduled) {
      this.logger.debug(
        `Step ${nextStep.stepId} already scheduled for ${input.restaurantId}`,
      );
      return;
    }

    const recommendation = this.buildStubRecommendation(input);
    const journeySelection = this.journeySelector.select(
      recommendation,
      nextIndex,
    );
    if (!journeySelection) return;

    const snapshot = this.buildMinimalSnapshot(input.restaurantId);
    const personalization = await this.contextLoader.loadPersonalizationContext(
      input.restaurantId,
      snapshot,
      recommendation,
    );

    const template = this.templateSelector.select({
      recommendationCode: input.recommendationCode,
      journey: journeySelection,
      channel: nextStep.channel,
    });
    if (!template) {
      this.logger.warn(
        `No template for journey step ${nextStep.stepId} (${nextStep.templateTrigger})`,
      );
      return;
    }

    const message = this.personalizationEngine.render(
      template,
      nextStep.channel,
      personalization,
    );

    await this.activeJourneys.startOrUpdateJourney(
      input.restaurantId,
      journeySelection,
    );

    const decisionId = randomUUID();
    await this.deliveryScheduler.schedule({
      restaurantId: input.restaurantId,
      decisionId,
      recommendationId: input.recommendationId,
      recommendationCode: input.recommendationCode,
      policyId: input.policyId,
      journeyId: input.journeyId,
      journeyStepId: nextStep.stepId,
      templateId: template.id,
      channel: nextStep.channel,
      message,
      delayDays: nextStep.delayDays,
      recipient: resolveEngagementRecipient(nextStep.channel, personalization),
      restaurantName: input.restaurantName ?? personalization.restaurantName,
      dryRun: false,
    });

    this.logger.log(
      `Scheduled journey step ${nextStep.stepId} (+${nextStep.delayDays}d) for ${input.restaurantId}`,
    );
  }

  private buildStubRecommendation(input: {
    recommendationId: string;
    recommendationCode: string;
    journeyId: string;
  }): DetectedRecommendation {
    return {
      id: input.recommendationId,
      code: input.recommendationCode,
      strategy: 'assist',
      priority: 'medium',
      confidence: 'medium',
      title: input.recommendationCode,
      summary: '',
      explanation: '',
      opportunityIds: [],
      signalIds: [],
      rssDimensions: [],
      expectedOutcome: '',
      recommendedJourneyType: 'activation',
      estimatedImpact: {
        rssDeltaRange: '0-5',
        outcome: 'followup',
        timeframe: '7d',
      },
      estimatedEffort: 'minutes',
      primaryJob: '',
      consumerHints: { journeyId: input.journeyId },
      principles: [],
      createdAt: new Date().toISOString(),
      ruleVersion: CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
      ruleId: 'journey-step-followup',
    };
  }

  private buildMinimalSnapshot(
    restaurantId: string,
  ): RestaurantSuccessSnapshot {
    return {
      restaurantId,
      computedAt: new Date().toISOString(),
      algorithmVersion: '1.0.0',
      modelVersion: '1.0.0',
      weightsCatalogVersion: '1.0.0',
      bandsCatalogVersion: '1.0.0',
      rss: {
        value: 50,
        band: 'attention',
        bandLabel: 'Atención',
        delta7d: null,
        delta30d: null,
        trend7d: null,
      },
      dimensions: {} as RestaurantSuccessSnapshot['dimensions'],
      topFactors: [],
      explanation: {
        headline: '',
        summary: '',
        dimensionSummaries: [],
        improvementPriorities: [],
      },
      signalsConsidered: [],
      signalIds: [],
      overlaysApplied: [],
      primaryJob: null,
      metadata: {
        intent: 'both',
        tenureDays: 0,
        traceability: {
          algorithmVersion: '1.0.0',
          weightsVersion: '1.0.0',
          bandsVersion: '1.0.0',
          signalsCount: 0,
        },
      },
    };
  }
}
