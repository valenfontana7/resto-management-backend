import { BusinessEventDigestService } from './business-event-digest.service';
import { BusinessEventStoreService } from './business-event-store.service';
import { BentooBusinessEventType } from './types/event-type.enum';
import {
  BusinessEventImportance,
  BusinessEventReplayPolicy,
} from '@prisma/client';

describe('BusinessEventDigestService', () => {
  const query = jest.fn();
  const store = { query } as unknown as BusinessEventStoreService;
  const service = new BusinessEventDigestService(store);

  beforeEach(() => {
    query.mockReset();
  });

  it('aggregates digest highlights by event type', async () => {
    const since = new Date('2026-06-21T00:00:00.000Z');
    const until = new Date('2026-06-28T00:00:00.000Z');

    query.mockResolvedValue([
      {
        id: '1',
        eventType: BentooBusinessEventType.PaymentFailed,
        restaurantId: 'rest-1',
        source: 'payments',
        importance: BusinessEventImportance.HIGH,
        replayPolicy: BusinessEventReplayPolicy.FULL,
        payload: { amount: 1000 },
        occurredAt: since,
      },
      {
        id: '2',
        eventType: BentooBusinessEventType.PaymentFailed,
        restaurantId: 'rest-1',
        source: 'payments',
        importance: BusinessEventImportance.HIGH,
        replayPolicy: BusinessEventReplayPolicy.FULL,
        payload: { amount: 2000 },
        occurredAt: since,
      },
      {
        id: '3',
        eventType: BentooBusinessEventType.DeliveryCompleted,
        restaurantId: 'rest-1',
        source: 'delivery',
        importance: BusinessEventImportance.NORMAL,
        replayPolicy: BusinessEventReplayPolicy.FULL,
        payload: { orderId: 'o1', orderNumber: '99' },
        occurredAt: since,
      },
    ]);

    const highlights = await service.getHighlights('rest-1', since, until);

    expect(highlights[0]).toEqual(
      expect.objectContaining({
        eventType: BentooBusinessEventType.PaymentFailed,
        count: 2,
        tone: 'attention',
      }),
    );
    expect(highlights).toHaveLength(2);
  });
});
