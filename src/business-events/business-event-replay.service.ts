import { Injectable, Logger } from '@nestjs/common';
import { BusinessEventBusService } from './business-event-bus.service';
import { BusinessEventStoreService } from './business-event-store.service';
import type { BentooBusinessEventType } from './types/event-type.enum';

export interface ReplayBusinessEventsOptions {
  since?: Date;
  until?: Date;
  eventTypes?: BentooBusinessEventType[];
  subscriberIds?: string[];
  limit?: number;
}

export interface ReplayBusinessEventsResult {
  replayedCount: number;
  skippedCount: number;
  eventIds: string[];
}

@Injectable()
export class BusinessEventReplayService {
  private readonly logger = new Logger(BusinessEventReplayService.name);

  constructor(
    private readonly store: BusinessEventStoreService,
    private readonly bus: BusinessEventBusService,
  ) {}

  /**
   * Re-dispatch historical events so new subscribers can rebuild context.
   * Events with replayPolicy SKIP are excluded from the store query by default.
   */
  async replayForRestaurant(
    restaurantId: string,
    options: ReplayBusinessEventsOptions = {},
  ): Promise<ReplayBusinessEventsResult> {
    const events = await this.store.query(restaurantId, {
      since: options.since,
      until: options.until,
      eventTypes: options.eventTypes,
      limit: options.limit ?? 1000,
      excludeReplaySkipped: true,
    });

    let skippedCount = 0;
    const eventIds: string[] = [];

    for (const event of events) {
      if (options.subscriberIds?.length) {
        const subscribers = this.bus
          .listSubscribers()
          .filter((s) => options.subscriberIds!.includes(s.id));

        if (subscribers.length === 0) {
          skippedCount += 1;
          continue;
        }

        await Promise.all(
          subscribers.map((subscriber) =>
            Promise.resolve(subscriber.handle({ ...event, isReplay: true })),
          ),
        );
      } else {
        await this.bus.dispatch({ ...event, isReplay: true });
      }

      eventIds.push(event.id);
    }

    this.logger.log(
      `Replayed ${eventIds.length} events for restaurant ${restaurantId}`,
    );

    return {
      replayedCount: eventIds.length,
      skippedCount,
      eventIds,
    };
  }
}
