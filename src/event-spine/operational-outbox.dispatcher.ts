import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalEventHandlerRegistry } from './operational-event-handler.registry';
import type { OperationalEventPayload } from './operational-event.types';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;

@Injectable()
export class OperationalOutboxDispatcher implements OnModuleInit {
  private readonly logger = new Logger(OperationalOutboxDispatcher.name);
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OperationalEventHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.logger.log('Operational event spine dispatcher ready');
  }

  @Cron('*/5 * * * * *')
  async dispatchPending(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const events = await this.prisma.operationalOutbox.findMany({
        where: {
          status: OutboxStatus.PENDING,
          availableAt: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const event of events) {
        await this.dispatchOne(event.id);
      }
    } finally {
      this.dispatching = false;
    }
  }

  async dispatchOne(outboxId: string): Promise<void> {
    const claimed = await this.prisma.operationalOutbox.updateMany({
      where: { id: outboxId, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING },
    });
    if (claimed.count === 0) return;

    const event = await this.prisma.operationalOutbox.findUnique({
      where: { id: outboxId },
    });
    if (!event) return;

    const payload = event.payload as unknown as OperationalEventPayload;
    const handlers = this.registry.getHandlers(
      event.eventType as OperationalEventPayload['eventType'],
    );

    try {
      for (const handler of handlers) {
        const already = await this.prisma.operationalEventProcessed.findUnique({
          where: {
            outboxId_handlerKey: {
              outboxId: event.id,
              handlerKey: handler.handlerKey,
            },
          },
        });
        if (already) continue;

        await handler.handle(payload, event.id);

        await this.prisma.operationalEventProcessed.create({
          data: {
            outboxId: event.id,
            handlerKey: handler.handlerKey,
          },
        });
      }

      await this.prisma.operationalOutbox.update({
        where: { id: outboxId },
        data: {
          status: OutboxStatus.DONE,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      const message =
        error instanceof Error ? error.message : 'Unknown dispatch error';

      await this.prisma.operationalOutbox.update({
        where: { id: outboxId },
        data: {
          status:
            attempts >= MAX_ATTEMPTS
              ? OutboxStatus.FAILED
              : OutboxStatus.PENDING,
          attempts,
          lastError: message,
          availableAt: new Date(Date.now() + Math.min(attempts * 5000, 60000)),
        },
      });

      this.logger.warn(
        `Outbox ${outboxId} failed (attempt ${attempts}): ${message}`,
      );
    }
  }
}
