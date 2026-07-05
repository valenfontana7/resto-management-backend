import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { LifecycleDeliveryProcessorService } from './lifecycle-delivery-processor.service';

@Injectable()
export class LifecycleCronService {
  private readonly logger = new Logger(LifecycleCronService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly deliveryProcessor: LifecycleDeliveryProcessorService,
  ) {}

  @Cron('*/5 * * * *')
  async processDueDeliveriesCron(): Promise<void> {
    if (
      this.config.get<string>('LIFECYCLE_MARKETING_CRON_ENABLED') === 'false'
    ) {
      return;
    }

    if (this.running) return;

    this.running = true;
    try {
      const limitRaw = this.config.get<string>(
        'LIFECYCLE_MARKETING_CRON_BATCH_LIMIT',
      );
      const limit = limitRaw ? Number(limitRaw) : 50;
      const safeLimit =
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50;

      const result =
        await this.deliveryProcessor.processDueDeliveries(safeLimit);

      if (result.processed > 0) {
        this.logger.log(
          `Lifecycle cron: ${result.processed} processed (${result.sent} sent, ${result.failed} failed)`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lifecycle cron failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
