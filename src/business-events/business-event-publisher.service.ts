import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { BusinessEventBusService } from './business-event-bus.service';
import { BusinessEventRealtimeService } from './business-event-realtime.service';
import { BusinessEventStoreService } from './business-event-store.service';
import type {
  BentooBusinessEvent,
  PublishBusinessEventInput,
} from './types/business-event.types';
import { getEventRegistryEntry } from './types/event-registry';
import { BusinessClockService } from '../common/time/business-clock.service';

@Injectable()
export class BusinessEventPublisherService {
  private readonly logger = new Logger(BusinessEventPublisherService.name);

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly store: BusinessEventStoreService,
    private readonly realtime: BusinessEventRealtimeService,
    @Optional() private readonly businessClock?: BusinessClockService,
  ) {}

  /**
   * Persist then dispatch — the single entry point for publishing business events.
   * Operational modules call this instead of reaching into cognitive layers directly.
   */
  async publish<T extends PublishBusinessEventInput['eventType']>(
    input: PublishBusinessEventInput<T>,
  ): Promise<BentooBusinessEvent<T>> {
    const registry = getEventRegistryEntry(input.eventType);
    const occurredAt = input.occurredAt ?? this.getBusinessNow();

    const event: BentooBusinessEvent<T> = {
      id: crypto.randomUUID(),
      eventType: input.eventType,
      restaurantId: input.restaurantId,
      source: input.source ?? registry.defaultSource,
      importance: registry.importance,
      replayPolicy: registry.replayPolicy,
      payload: input.payload,
      occurredAt,
      correlationId: input.correlationId,
      isReplay: false,
    };

    await this.store.append(event);

    this.logger.debug(
      `Published ${event.eventType} for restaurant ${event.restaurantId} (${event.id})`,
    );

    void this.bus.dispatch(event);
    this.realtime.emit(event);

    return event;
  }

  /**
   * Skip publish when the same eventType + correlationId occurred inside the window.
   * Used by monitors for SUMMARY events (OrderDelayed, DailyClosingMissing).
   */
  async publishDeduped<T extends PublishBusinessEventInput['eventType']>(
    input: PublishBusinessEventInput<T>,
    dedupeWindowMinutes: number,
  ): Promise<BentooBusinessEvent<T> | null> {
    if (input.correlationId) {
      const since = new Date(
        this.getBusinessNow().getTime() - dedupeWindowMinutes * 60_000,
      );
      const recent = await this.store.query(input.restaurantId, {
        eventTypes: [input.eventType],
        since,
        limit: 200,
      });

      if (recent.some((event) => event.correlationId === input.correlationId)) {
        return null;
      }
    }

    return this.publish(input);
  }

  private getBusinessNow(): Date {
    return this.businessClock?.now() ?? new Date();
  }
}
