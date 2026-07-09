import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CoordinationService } from './coordination.service';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(private readonly coordinations: CoordinationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      const n = await this.coordinations.expireOverdue();
      if (n > 0) {
        this.logger.debug(`Escalated ${n} overdue coordination(s)`);
      }
    } catch (error) {
      this.logger.warn(
        `Escalation tick failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
