import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { getJourneyById } from '../catalog/journey-catalog.loader';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { ActiveJourneyService } from './active-journey.service';
import { EngagementEngineService } from './engagement-engine.service';

@Injectable()
export class JourneyStepSchedulerService {
  private readonly logger = new Logger(JourneyStepSchedulerService.name);

  constructor(
    private readonly persistence: EngagementPersistenceService,
    private readonly activeJourneys: ActiveJourneyService,
    @Inject(forwardRef(() => EngagementEngineService))
    private readonly engagementEngine: EngagementEngineService,
  ) {}

  /**
   * Tras enviar un paso, programa el siguiente del catálogo J-* vía pipeline CS completo.
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

    await this.engagementEngine.processJourneyFollowUpStep({
      restaurantId: input.restaurantId,
      recommendationId: input.recommendationId,
      recommendationCode: input.recommendationCode,
      journeyId: input.journeyId,
      journeyStepIndex: nextIndex,
    });

    this.logger.log(
      `Scheduled journey step ${nextStep.stepId} (+${nextStep.delayDays}d) for ${input.restaurantId} via policy pipeline`,
    );
  }
}
