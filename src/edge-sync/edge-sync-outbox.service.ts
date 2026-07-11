import { Injectable } from '@nestjs/common';
import { Prisma, SyncOutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_OUTBOX_RETRIES = 5;
const DEFAULT_BATCH_SIZE = 25;

export interface EnqueueSyncOutboxInput {
  restaurantId: string;
  entityType: string;
  clientMutationId?: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class EdgeSyncOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueSyncOutboxInput): Promise<void> {
    const clientMutationId = input.clientMutationId?.trim();
    if (!clientMutationId) return;

    await this.prisma.syncOutbox.upsert({
      where: {
        restaurantId_clientMutationId: {
          restaurantId: input.restaurantId,
          clientMutationId,
        },
      },
      create: {
        restaurantId: input.restaurantId,
        entityType: input.entityType,
        clientMutationId,
        payload: input.payload as Prisma.InputJsonValue,
        status: SyncOutboxStatus.PENDING,
      },
      update: {
        entityType: input.entityType,
        payload: input.payload as Prisma.InputJsonValue,
        status: SyncOutboxStatus.PENDING,
        lastError: null,
      },
    });
  }

  async listPending(restaurantId: string, limit = DEFAULT_BATCH_SIZE) {
    return this.prisma.syncOutbox.findMany({
      where: {
        restaurantId,
        OR: [
          { status: SyncOutboxStatus.PENDING },
          {
            status: SyncOutboxStatus.FAILED,
            retryCount: { lt: MAX_OUTBOX_RETRIES },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async countPending(restaurantId: string): Promise<number> {
    return this.prisma.syncOutbox.count({
      where: {
        restaurantId,
        status: {
          in: [SyncOutboxStatus.PENDING, SyncOutboxStatus.FAILED],
        },
      },
    });
  }

  async markSyncing(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.syncOutbox.updateMany({
      where: { id: { in: ids } },
      data: { status: SyncOutboxStatus.SYNCING },
    });
  }

  async markCompleted(restaurantId: string, clientMutationId: string) {
    await this.prisma.syncOutbox.updateMany({
      where: { restaurantId, clientMutationId },
      data: {
        status: SyncOutboxStatus.COMPLETED,
        lastError: null,
      },
    });
  }

  async markFailed(
    restaurantId: string,
    clientMutationId: string,
    reason: string,
  ) {
    const row = await this.prisma.syncOutbox.findUnique({
      where: {
        restaurantId_clientMutationId: { restaurantId, clientMutationId },
      },
      select: { retryCount: true },
    });
    if (!row) return;

    await this.prisma.syncOutbox.update({
      where: {
        restaurantId_clientMutationId: { restaurantId, clientMutationId },
      },
      data: {
        status: SyncOutboxStatus.FAILED,
        lastError: reason.slice(0, 500),
        retryCount: row.retryCount + 1,
      },
    });
  }

  async resetSyncingToPending(restaurantId: string): Promise<void> {
    await this.prisma.syncOutbox.updateMany({
      where: {
        restaurantId,
        status: SyncOutboxStatus.SYNCING,
      },
      data: { status: SyncOutboxStatus.PENDING },
    });
  }
}
