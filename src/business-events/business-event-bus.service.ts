import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import type {
  BentooBusinessEvent,
  BusinessEventSubscriber,
} from './types/business-event.types';
import { BentooBusinessEventType } from './types/event-type.enum';

const DISPATCH_CHANNEL = 'bentoo.business-event';

@Injectable()
export class BusinessEventBusService implements OnModuleDestroy {
  private readonly logger = new Logger(BusinessEventBusService.name);
  private readonly emitter = new EventEmitter();
  private readonly subscribers = new Map<string, BusinessEventSubscriber>();

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
    this.subscribers.clear();
  }

  registerSubscriber(subscriber: BusinessEventSubscriber): void {
    if (this.subscribers.has(subscriber.id)) {
      throw new Error(
        `Business event subscriber "${subscriber.id}" is already registered`,
      );
    }
    this.subscribers.set(subscriber.id, subscriber);
  }

  listSubscribers(): readonly BusinessEventSubscriber[] {
    return [...this.subscribers.values()];
  }

  async dispatch(event: BentooBusinessEvent): Promise<void> {
    const targets = [...this.subscribers.values()].filter((subscriber) =>
      subscriberMatchesEvent(subscriber, event.eventType),
    );

    await Promise.all(
      targets.map(async (subscriber) => {
        try {
          await subscriber.handle({
            ...event,
            isReplay: event.isReplay ?? false,
          });
        } catch (error) {
          this.logger.error(
            `Subscriber "${subscriber.id}" failed for ${event.eventType} (${event.id}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );

    this.emitter.emit(DISPATCH_CHANNEL, event);
  }

  /** Optional passive listeners (e.g. diagnostics) */
  onEvent(listener: (event: BentooBusinessEvent) => void): () => void {
    this.emitter.on(DISPATCH_CHANNEL, listener);
    return () => this.emitter.off(DISPATCH_CHANNEL, listener);
  }
}

function subscriberMatchesEvent(
  subscriber: BusinessEventSubscriber,
  eventType: BentooBusinessEventType,
): boolean {
  if (!subscriber.eventTypes || subscriber.eventTypes.length === 0) {
    return true;
  }
  return subscriber.eventTypes.includes(eventType);
}
