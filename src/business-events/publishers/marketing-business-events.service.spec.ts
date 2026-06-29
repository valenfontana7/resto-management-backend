import { MarketingBusinessEventsService } from './marketing-business-events.service';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

describe('MarketingBusinessEventsService', () => {
  const publish = jest.fn().mockResolvedValue(undefined);
  const publishDeduped = jest.fn().mockResolvedValue(undefined);
  const publisher = {
    publish,
    publishDeduped,
  } as unknown as BusinessEventPublisherService;
  const service = new MarketingBusinessEventsService(publisher);

  beforeEach(() => {
    publish.mockClear();
    publishDeduped.mockClear();
  });

  it('publishes MarketingPublished', async () => {
    service.publishMarketingPublished({
      restaurantId: 'rest-1',
      title: 'La Nonna',
      channel: 'website',
    });

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.MarketingPublished,
        payload: {
          campaignId: undefined,
          channel: 'website',
          title: 'La Nonna',
        },
      }),
    );
  });

  it('publishes deduped MarketingSkipped', async () => {
    service.publishMarketingSkipped({
      restaurantId: 'rest-1',
      reason: 'site-unpublished',
    });

    await Promise.resolve();

    expect(publishDeduped).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.MarketingSkipped,
        payload: { campaignId: undefined, reason: 'site-unpublished' },
      }),
      7 * 24 * 60,
    );
  });
});
