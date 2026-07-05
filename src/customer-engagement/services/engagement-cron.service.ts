import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { EngagementDeliveryProcessorService } from './engagement-delivery-processor.service';

@Injectable()
export class EngagementCronService {
  private readonly logger = new Logger(EngagementCronService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly deliveryProcessor: EngagementDeliveryProcessorService,
  ) {}

  @Cron('*/5 * * * *')
  async processDueDeliveriesCron(): Promise<void> {
    if (this.config.get<string>('ENGAGEMENT_CRON_ENABLED') === 'false') {
      return;
    }

    if (this.running) {
      this.logger.debug('Engagement cron skipped — previous run still active');
      return;
    }

    this.running = true;
    try {
      const limitRaw = this.config.get<string>('ENGAGEMENT_CRON_BATCH_LIMIT');
      const limit = limitRaw ? Number(limitRaw) : 50;
      const safeLimit =
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50;

      const result =
        await this.deliveryProcessor.processDueDeliveries(safeLimit);

      if (result.processed > 0) {
        this.logger.log(
          `Engagement cron: ${result.processed} processed (${result.sent} sent, ${result.failed} failed)`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Engagement cron failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
