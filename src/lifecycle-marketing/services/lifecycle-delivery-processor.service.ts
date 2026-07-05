import { Injectable, Logger } from '@nestjs/common';
import { LifecyclePersistenceService } from '../stores/lifecycle-persistence.service';
import { CampaignStepSchedulerService } from './campaign-step-scheduler.service';
import type { LifecycleChannelAdapter } from '../types/channel.types';

@Injectable()
export class LifecycleDeliveryProcessorService {
  private readonly logger = new Logger(LifecycleDeliveryProcessorService.name);
  private readonly adapters = new Map<string, LifecycleChannelAdapter>();

  constructor(
    private readonly persistence: LifecyclePersistenceService,
    private readonly stepScheduler: CampaignStepSchedulerService,
  ) {}

  registerAdapter(adapter: LifecycleChannelAdapter): void {
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
      await this.persistence.updateDeliveryStatus(deliveryId, 'FAILED', {
        errorMessage: `No adapter for channel ${row.channel}`,
      });
      return false;
    }

    const result = await adapter.deliver({
      deliveryId: row.id,
      restaurantId: row.restaurantId,
      channel: row.channel,
      recipient: row.recipient,
      subject: row.subject,
      body: row.bodyFull ?? row.bodyPreview,
      ctaLabel: row.ctaLabel,
      ctaUrl: row.ctaUrl,
      metadata: {
        campaignId: row.campaignId,
        templateId: row.templateId,
        restaurantName: row.restaurant?.name ?? undefined,
      },
    });

    const status =
      result.status === 'failed'
        ? 'FAILED'
        : result.status === 'sent'
          ? 'SENT'
          : 'SIMULATED';

    await this.persistence.updateDeliveryStatus(deliveryId, status, {
      sentAt: new Date(),
      externalMessageId: result.providerMessageId ?? undefined,
      errorMessage: result.error ?? undefined,
    });

    this.logger.log(`Lifecycle delivery ${deliveryId} → ${status}`);

    if (status !== 'FAILED') {
      await this.stepScheduler.scheduleNextStepAfterDelivery(row);
    }

    return status !== 'FAILED';
  }
}
