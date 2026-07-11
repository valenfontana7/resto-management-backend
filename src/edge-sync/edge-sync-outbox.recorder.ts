import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isLocalMode } from '../common/config/bentoo-mode.config';
import { EdgeSyncOutboxService } from './edge-sync-outbox.service';

@Injectable()
export class EdgeSyncOutboxRecorder {
  constructor(private readonly outbox: EdgeSyncOutboxService) {}

  async recordFloorMutation(input: {
    restaurantId: string;
    entityType: string;
    clientMutationId?: string;
    userId: string;
    sessionId?: string;
    body: Record<string, unknown>;
  }): Promise<void> {
    if (!isLocalMode()) return;

    const clientMutationId = input.clientMutationId?.trim() || randomUUID();
    const payload: Record<string, unknown> = input.sessionId
      ? {
          sessionId: input.sessionId,
          body: {
            ...input.body,
            clientMutationId,
            userId: input.userId,
          },
        }
      : {
          ...input.body,
          clientMutationId,
          userId: input.userId,
        };

    await this.outbox.enqueue({
      restaurantId: input.restaurantId,
      entityType: input.entityType,
      clientMutationId,
      payload,
    });
  }
}
