import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxStatus, Prisma } from '@prisma/client';
import type { OperationalEventPayload } from './operational-event.types';
import { BusinessClockService } from '../common/time/business-clock.service';

@Injectable()
export class OperationalOutboxPublisher {
  private readonly logger = new Logger(OperationalOutboxPublisher.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly businessClock?: BusinessClockService,
  ) {}

  async publish(
    payload: Omit<OperationalEventPayload, 'occurredAt'> & {
      occurredAt?: string;
    },
  ): Promise<string> {
    const row = await this.prisma.operationalOutbox.create({
      data: {
        restaurantId: payload.restaurantId,
        eventType: payload.eventType,
        aggregateType: payload.aggregateType,
        aggregateId: payload.aggregateId,
        payload: {
          ...payload,
          occurredAt: payload.occurredAt ?? this.getBusinessNow().toISOString(),
        } as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      },
    });

    this.logger.debug(
      `Published ${payload.eventType} for ${payload.aggregateType}:${payload.aggregateId}`,
    );

    return row.id;
  }

  async publishInTransaction(
    tx: Pick<PrismaService, 'operationalOutbox'>,
    payload: Omit<OperationalEventPayload, 'occurredAt'> & {
      occurredAt?: string;
    },
  ): Promise<string> {
    const row = await tx.operationalOutbox.create({
      data: {
        restaurantId: payload.restaurantId,
        eventType: payload.eventType,
        aggregateType: payload.aggregateType,
        aggregateId: payload.aggregateId,
        payload: {
          ...payload,
          occurredAt: payload.occurredAt ?? this.getBusinessNow().toISOString(),
        } as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      },
    });
    return row.id;
  }

  private getBusinessNow(): Date {
    return this.businessClock?.now() ?? new Date();
  }
}
