import { LoyaltyBusinessEventsService } from './loyalty-business-events.service';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

describe('LoyaltyBusinessEventsService', () => {
  const publish = jest.fn().mockResolvedValue(undefined);
  const publisher = { publish } as unknown as BusinessEventPublisherService;
  const service = new LoyaltyBusinessEventsService(publisher);

  beforeEach(() => {
    publish.mockClear();
  });

  it('publishes LoyaltyPointsEarned', async () => {
    service.publishPointsEarned({
      restaurantId: 'rest-1',
      accountId: 'acc-1',
      customerEmail: 'ana@example.com',
      customerName: 'Ana',
      points: 50,
      orderId: 'ord-1',
      newBalance: 150,
    });

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.LoyaltyPointsEarned,
        correlationId: 'ord-1',
        payload: expect.objectContaining({
          points: 50,
          newBalance: 150,
        }),
      }),
    );
  });

  it('publishes LoyaltyPointsRedeemed', async () => {
    service.publishPointsRedeemed({
      restaurantId: 'rest-1',
      accountId: 'acc-1',
      customerEmail: 'ana@example.com',
      points: 100,
      newBalance: 50,
    });

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.LoyaltyPointsRedeemed,
        correlationId: 'acc-1',
      }),
    );
  });

  it('publishes LoyaltyTierUpgraded', async () => {
    service.publishTierUpgraded({
      restaurantId: 'rest-1',
      accountId: 'acc-1',
      customerEmail: 'ana@example.com',
      previousTier: 'Bronce',
      newTier: 'Plata',
      totalEarned: 500,
    });

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.LoyaltyTierUpgraded,
        payload: expect.objectContaining({
          previousTier: 'Bronce',
          newTier: 'Plata',
        }),
      }),
    );
  });
});
