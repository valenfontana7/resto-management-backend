import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { EngagementDeliveryProcessorService } from './engagement-delivery-processor.service';
import type { EngagementChannelAdapter } from '../types/channel.types';
import type { ScheduledDelivery } from '../types/delivery.types';
import type { PersonalizedMessage } from '../types/template.types';
import { CUSTOMER_ENGAGEMENT_ENGINE_VERSION } from '../types/engagement.types';

@Injectable()
export class DeliveryScheduler {
  private readonly adapters = new Map<string, EngagementChannelAdapter>();

  constructor(
    private readonly persistence: EngagementPersistenceService,
    private readonly deliveryProcessor: EngagementDeliveryProcessorService,
  ) {}

  registerAdapter(adapter: EngagementChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
    this.deliveryProcessor.registerAdapter(adapter);
  }

  async schedule(input: {
    restaurantId: string;
    decisionId: string;
    recommendationId: string;
    recommendationCode: string;
    policyId: string;
    journeyId: string;
    journeyStepId: string;
    templateId: string;
    channel: string;
    message: PersonalizedMessage;
    delayDays: number;
    recipient: string | null;
    restaurantName?: string;
    dryRun?: boolean;
  }): Promise<{
    delivery: ScheduledDelivery;
    channelResult: null;
  }> {
    const now = new Date();
    const deliverAt = new Date(now);
    deliverAt.setDate(deliverAt.getDate() + input.delayDays);

    const deliveryId = randomUUID();

    if (input.dryRun) {
      const delivery: ScheduledDelivery = {
        id: deliveryId,
        restaurantId: input.restaurantId,
        recommendationId: input.recommendationId,
        recommendationCode: input.recommendationCode,
        policyId: input.policyId,
        journeyId: input.journeyId,
        journeyStepId: input.journeyStepId,
        templateId: input.templateId,
        channel: input.message.channel,
        status: 'scheduled',
        scheduledAt: now.toISOString(),
        deliverAt: deliverAt.toISOString(),
        createdAt: now.toISOString(),
        subject: input.message.subject,
        bodyPreview: input.message.body.slice(0, 280),
        ctaLabel: input.message.ctaLabel,
        ctaUrl: input.message.ctaUrl,
        recipient: input.recipient,
        trace: {
          engineVersion: CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
          decisionId: input.decisionId,
        },
      };
      return { delivery, channelResult: null };
    }

    const delivery = await this.persistence.saveDelivery({
      id: deliveryId,
      restaurantId: input.restaurantId,
      decisionId: input.decisionId,
      recommendationId: input.recommendationId,
      recommendationCode: input.recommendationCode,
      policyId: input.policyId,
      journeyId: input.journeyId,
      journeyStepId: input.journeyStepId,
      templateId: input.templateId,
      channel: input.message.channel,
      status: 'scheduled',
      recipient: input.recipient,
      subject: input.message.subject,
      bodyPreview: input.message.body.slice(0, 280),
      bodyFull: input.message.body,
      ctaLabel: input.message.ctaLabel,
      ctaUrl: input.message.ctaUrl,
      scheduledAt: now,
      deliverAt,
      engineVersion: CUSTOMER_ENGAGEMENT_ENGINE_VERSION,
    });

    if (input.delayDays > 0) {
      return { delivery, channelResult: null };
    }

    await this.deliveryProcessor.executeDelivery(delivery.id);
    const refreshed = await this.persistence.getDelivery(delivery.id);

    return {
      delivery: refreshed ?? delivery,
      channelResult: null,
    };
  }
}
