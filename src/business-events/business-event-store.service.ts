import { Injectable } from '@nestjs/common';
import { BusinessEventReplayPolicy, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BentooBusinessEvent } from './types/business-event.types';
import type { BentooBusinessEventType } from './types/event-type.enum';
import type { BentooBusinessEventPayloadMap } from './types/payloads';

export interface QueryBusinessEventsOptions {
  since?: Date;
  until?: Date;
  eventTypes?: BentooBusinessEventType[];
  limit?: number;
  excludeReplaySkipped?: boolean;
}

@Injectable()
export class BusinessEventStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async append(event: BentooBusinessEvent): Promise<BentooBusinessEvent> {
    const row = await this.prisma.businessEvent.create({
      data: {
        id: event.id,
        restaurantId: event.restaurantId,
        eventType: event.eventType,
        source: event.source,
        importance: event.importance,
        replayPolicy: event.replayPolicy,
        payload: event.payload as unknown as Prisma.InputJsonValue,
        occurredAt: event.occurredAt,
        correlationId: event.correlationId ?? null,
      },
    });

    return this.toEvent(row);
  }

  async query(
    restaurantId: string,
    options: QueryBusinessEventsOptions = {},
  ): Promise<BentooBusinessEvent[]> {
    const where: Prisma.BusinessEventWhereInput = { restaurantId };

    if (options.since || options.until) {
      where.occurredAt = {};
      if (options.since) where.occurredAt.gte = options.since;
      if (options.until) where.occurredAt.lte = options.until;
    }

    if (options.eventTypes?.length) {
      where.eventType = { in: options.eventTypes };
    }

    if (options.excludeReplaySkipped !== false) {
      where.replayPolicy = { not: BusinessEventReplayPolicy.SKIP };
    }

    const rows = await this.prisma.businessEvent.findMany({
      where,
      orderBy: { occurredAt: 'asc' },
      take: options.limit ?? 500,
    });

    return rows.map((row) => this.toEvent(row));
  }

  private toEvent(row: {
    id: string;
    restaurantId: string;
    eventType: string;
    source: string;
    importance: BentooBusinessEvent['importance'];
    replayPolicy: BentooBusinessEvent['replayPolicy'];
    payload: Prisma.JsonValue;
    occurredAt: Date;
    correlationId: string | null;
  }): BentooBusinessEvent {
    return {
      id: row.id,
      eventType: row.eventType as BentooBusinessEventType,
      restaurantId: row.restaurantId,
      source: row.source,
      importance: row.importance,
      replayPolicy: row.replayPolicy,
      payload:
        row.payload as unknown as BentooBusinessEventPayloadMap[BentooBusinessEventType],
      occurredAt: row.occurredAt,
      correlationId: row.correlationId,
    };
  }
}
