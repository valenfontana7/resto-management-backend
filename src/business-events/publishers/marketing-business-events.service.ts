import { Injectable } from '@nestjs/common';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

@Injectable()
export class MarketingBusinessEventsService {
  constructor(private readonly publisher: BusinessEventPublisherService) {}

  publishMarketingPublished(input: {
    restaurantId: string;
    title: string;
    channel?: string;
    campaignId?: string;
    source?: string;
  }): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.MarketingPublished,
        restaurantId: input.restaurantId,
        source: input.source ?? 'builder',
        correlationId: input.campaignId ?? `site:${input.restaurantId}`,
        payload: {
          campaignId: input.campaignId,
          channel: input.channel ?? 'website',
          title: input.title,
        },
      })
      .catch(() => undefined);
  }

  publishMarketingSkipped(input: {
    restaurantId: string;
    reason: string;
    campaignId?: string;
    source?: string;
  }): void {
    void this.publisher
      .publishDeduped(
        {
          eventType: BentooBusinessEventType.MarketingSkipped,
          restaurantId: input.restaurantId,
          source: input.source ?? 'builder',
          correlationId: input.campaignId ?? `site:${input.restaurantId}`,
          payload: {
            campaignId: input.campaignId,
            reason: input.reason,
          },
        },
        7 * 24 * 60,
      )
      .catch(() => undefined);
  }
}
