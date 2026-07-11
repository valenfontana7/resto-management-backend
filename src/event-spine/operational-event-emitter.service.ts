import { Injectable, Logger } from '@nestjs/common';
import { OperationalOutboxPublisher } from './operational-outbox.publisher';
import { OperationalOutboxDispatcher } from './operational-outbox.dispatcher';
import type { OperationalEventPayload } from './operational-event.types';

@Injectable()
export class OperationalEventEmitter {
  private readonly logger = new Logger(OperationalEventEmitter.name);

  constructor(
    private readonly publisher: OperationalOutboxPublisher,
    private readonly dispatcher: OperationalOutboxDispatcher,
  ) {}

  emit(payload: Omit<OperationalEventPayload, 'occurredAt'>): void {
    void this.publisher
      .publish(payload)
      .then((outboxId) => this.dispatcher.dispatchOne(outboxId))
      .catch((error) => {
        this.logger.warn(
          `Operational event emit failed (${payload.eventType}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
