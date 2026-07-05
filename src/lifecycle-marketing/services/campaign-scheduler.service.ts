import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LifecyclePersistenceService } from '../stores/lifecycle-persistence.service';
import { LifecycleDeliveryProcessorService } from './lifecycle-delivery-processor.service';
import type {
  LifecycleCampaignType,
  LifecycleChannelType,
} from '../types/campaign.types';
import { LIFECYCLE_MARKETING_ENGINE_VERSION } from '../types/campaign.types';
import type { LifecycleDeliveryRecord } from '../types/delivery.types';
import type { LifecyclePersonalizedMessage } from '../types/template.types';

@Injectable()
export class CampaignScheduler {
  constructor(
    private readonly persistence: LifecyclePersistenceService,
    private readonly deliveryProcessor: LifecycleDeliveryProcessorService,
  ) {}

  async schedule(input: {
    restaurantId: string;
    campaignRunId: string;
    campaignId: string;
    campaignType: LifecycleCampaignType;
    stepId: string;
    recommendationCode: string | null;
    opportunityCode: string | null;
    templateId: string;
    channel: LifecycleChannelType;
    message: LifecyclePersonalizedMessage;
    delayDays: number;
    recipient: string | null;
    dryRun?: boolean;
  }): Promise<{
    delivery: LifecycleDeliveryRecord | null;
    preview: LifecycleScheduledPreview;
  }> {
    const now = new Date();
    const deliverAt = new Date(now);
    deliverAt.setDate(deliverAt.getDate() + input.delayDays);
    const deliveryId = randomUUID();

    const preview: LifecycleScheduledPreview = {
      id: deliveryId,
      campaignId: input.campaignId,
      campaignType: input.campaignType,
      stepId: input.stepId,
      channel: input.channel,
      templateId: input.templateId,
      deliverAt: deliverAt.toISOString(),
      subject: input.message.subject,
      bodyPreview: input.message.body.slice(0, 280),
    };

    if (input.dryRun) {
      return { delivery: null, preview };
    }

    const delivery = await this.persistence.saveDelivery({
      id: deliveryId,
      restaurantId: input.restaurantId,
      campaignRunId: input.campaignRunId,
      campaignId: input.campaignId,
      campaignType: input.campaignType,
      stepId: input.stepId,
      recommendationCode: input.recommendationCode,
      opportunityCode: input.opportunityCode,
      templateId: input.templateId,
      channel: input.channel,
      status: 'SCHEDULED',
      recipient: input.recipient,
      subject: input.message.subject,
      bodyPreview: input.message.body.slice(0, 280),
      bodyFull: input.message.body,
      ctaLabel: input.message.ctaLabel,
      ctaUrl: input.message.ctaUrl,
      scheduledAt: now,
      deliverAt,
      engineVersion: LIFECYCLE_MARKETING_ENGINE_VERSION,
    });

    if (input.delayDays === 0) {
      await this.deliveryProcessor.executeDelivery(delivery.id);
      const refreshed = await this.persistence.getDelivery(delivery.id);
      return { delivery: refreshed ?? delivery, preview };
    }

    return { delivery, preview };
  }
}

export interface LifecycleScheduledPreview {
  id: string;
  campaignId: string;
  campaignType: LifecycleCampaignType;
  stepId: string;
  channel: LifecycleChannelType;
  templateId: string;
  deliverAt: string;
  subject: string | null;
  bodyPreview: string;
}
