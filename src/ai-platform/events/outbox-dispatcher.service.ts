import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEventHandlerRegistry } from './domain-event-handler.registry';
import type { DomainEventPayload, DomainEventType } from './domain-event.types';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DomainEventHandlerRegistry,
  ) {}

  @Cron('*/5 * * * * *')
  async dispatchPending(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const events = await this.prisma.domainOutbox.findMany({
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

  /** Procesamiento inmediato tras publicar (misma instancia, sin esperar cron). */
  async dispatchOne(outboxId: string): Promise<void> {
    const claimed = await this.prisma.domainOutbox.updateMany({
      where: { id: outboxId, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING },
    });
    if (claimed.count === 0) return;

    const event = await this.prisma.domainOutbox.findUnique({
      where: { id: outboxId },
    });
    if (!event) return;

    const handlers = this.registry.getHandlers(
      event.eventType as DomainEventType,
    );
    const payload = event.payload as unknown as DomainEventPayload;

    try {
      for (const handler of handlers) {
        const already = await this.prisma.domainEventProcessed.findUnique({
          where: {
            outboxId_handlerKey: {
              outboxId: event.id,
              handlerKey: handler.handlerKey,
            },
          },
        });
        if (already) continue;

        await handler.handle(payload, event.id);

        await this.prisma.domainEventProcessed.create({
          data: {
            outboxId: event.id,
            handlerKey: handler.handlerKey,
          },
        });
      }

      await this.prisma.domainOutbox.update({
        where: { id: event.id },
        data: {
          status: OutboxStatus.DONE,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = event.attempts + 1;
      const backoffMs = Math.min(60_000, 1000 * 2 ** attempts);

      await this.prisma.domainOutbox.update({
        where: { id: event.id },
        data: {
          status:
            attempts >= MAX_ATTEMPTS
              ? OutboxStatus.FAILED
              : OutboxStatus.PENDING,
          attempts,
          lastError: message,
          availableAt: new Date(Date.now() + backoffMs),
        },
      });

      this.logger.warn(`Outbox dispatch failed ${event.id}: ${message}`);
    }
  }
}
