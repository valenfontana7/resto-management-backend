import { Injectable, Logger } from '@nestjs/common';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { JourneyStepSchedulerService } from './journey-step-scheduler.service';
import type { EngagementChannelAdapter } from '../types/channel.types';
import type { ScheduledDelivery } from '../types/delivery.types';

@Injectable()
export class EngagementDeliveryProcessorService {
  private readonly logger = new Logger(EngagementDeliveryProcessorService.name);
  private readonly adapters = new Map<string, EngagementChannelAdapter>();

  constructor(
    private readonly persistence: EngagementPersistenceService,
    private readonly journeySteps: JourneyStepSchedulerService,
  ) {}

  registerAdapter(adapter: EngagementChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  async processDueDeliveries(limit = 50): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    const due = await this.persistence.listDueDeliveries(limit);
    let sent = 0;
    let failed = 0;

    for (const delivery of due) {
      const ok = await this.executeDelivery(delivery.id);
      if (ok) sent += 1;
      else failed += 1;
    }

    return { processed: due.length, sent, failed };
  }

  async executeDelivery(deliveryId: string): Promise<boolean> {
    const row = await this.persistence.getDeliveryWithBody(deliveryId);
    if (!row || row.status !== 'SCHEDULED') {
      return false;
    }

    const adapter = this.adapters.get(row.channel);
    if (!adapter) {
      await this.persistence.updateDeliveryStatus(deliveryId, 'failed', {
        errorMessage: `No adapter for channel ${row.channel}`,
      });
      return false;
    }

    const result = await adapter.deliver({
      deliveryId: row.id,
      restaurantId: row.restaurantId,
      channel: row.channel as ScheduledDelivery['channel'],
      recipient: row.recipient,
      subject: row.subject,
      body: row.bodyFull ?? row.bodyPreview,
      ctaLabel: row.ctaLabel,
      ctaUrl: row.ctaUrl,
      metadata: {
        recommendationCode: row.recommendationCode,
        templateId: row.templateId,
        journeyId: row.journeyId,
        restaurantName: row.restaurant?.name ?? undefined,
      },
    });

    const status =
      result.status === 'failed'
        ? 'failed'
        : result.status === 'sent'
          ? 'sent'
          : 'simulated';

    await this.persistence.updateDeliveryStatus(deliveryId, status, {
      sentAt: new Date(),
      externalMessageId: result.providerMessageId ?? undefined,
      errorMessage: result.error ?? undefined,
    });

    this.logger.log(`Delivery ${deliveryId} → ${status} (${row.channel})`);

    if (status !== 'failed') {
      await this.journeySteps.scheduleNextStepAfterDelivery({
        id: row.id,
        restaurantId: row.restaurantId,
        decisionId: row.decisionId,
        recommendationId: row.recommendationId,
        recommendationCode: row.recommendationCode,
        policyId: row.policyId,
        journeyId: row.journeyId,
        journeyStepId: row.journeyStepId,
        restaurantName: row.restaurant?.name ?? null,
      });
    }

    return status !== 'failed';
  }
}
