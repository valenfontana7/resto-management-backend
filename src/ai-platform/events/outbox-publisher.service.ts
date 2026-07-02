import { Injectable } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DomainEventPayload, DomainEventType } from './domain-event.types';

@Injectable()
export class OutboxPublisherService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(
    eventType: DomainEventType,
    aggregateType: string,
    aggregateId: string,
    payload: DomainEventPayload,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.domainOutbox.create({
      data: {
        eventType,
        aggregateType,
        aggregateId,
        payload: payload as unknown as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      },
    });
  }
}
