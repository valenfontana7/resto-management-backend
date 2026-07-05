import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { CampaignRegistry } from './campaign-registry.service';
import { LifecyclePersistenceService } from '../stores/lifecycle-persistence.service';
import { LifecycleMarketingService } from './lifecycle-marketing.service';

@Injectable()
export class CampaignStepSchedulerService {
  private readonly logger = new Logger(CampaignStepSchedulerService.name);

  constructor(
    private readonly registry: CampaignRegistry,
    private readonly persistence: LifecyclePersistenceService,
    @Inject(forwardRef(() => LifecycleMarketingService))
    private readonly lifecycleService: LifecycleMarketingService,
  ) {}

  async scheduleNextStepAfterDelivery(row: {
    id: string;
    restaurantId: string;
    campaignId: string;
    stepId: string;
    recommendationCode: string | null;
    opportunityCode: string | null;
  }): Promise<void> {
    const campaign = this.registry.getCampaign(row.campaignId);
    if (!campaign || campaign.steps.length <= 1) return;

    const currentIndex = campaign.steps.findIndex(
      (s) => s.stepId === row.stepId,
    );
    if (currentIndex < 0 || currentIndex >= campaign.steps.length - 1) {
      return;
    }

    const nextIndex = currentIndex + 1;
    const nextStep = campaign.steps[nextIndex];
    const alreadyScheduled = await this.persistence.hasCampaignStepDelivery(
      row.restaurantId,
      row.campaignId,
      nextStep.stepId,
    );
    if (alreadyScheduled) {
      return;
    }

    this.logger.debug(
      `Scheduling follow-up step ${nextIndex} for campaign ${row.campaignId}`,
    );

    await this.lifecycleService.processCampaignFollowUp({
      restaurantId: row.restaurantId,
      campaignId: row.campaignId,
      stepIndex: nextIndex,
      recommendationCode: row.recommendationCode,
      opportunityCode: row.opportunityCode,
    });
  }
}
