import { PaymentBusinessEventsService } from './payment-business-events.service';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

describe('PaymentBusinessEventsService', () => {
  const publishDeduped = jest.fn().mockResolvedValue(undefined);
  const publish = jest.fn().mockResolvedValue(undefined);
  const publisher = {
    publishDeduped,
    publish,
  } as unknown as BusinessEventPublisherService;
  const service = new PaymentBusinessEventsService(publisher);

  beforeEach(() => {
    publishDeduped.mockClear();
    publish.mockClear();
  });

  it('publishes deduped PaymentFailed', async () => {
    service.publishPaymentFailed({
      restaurantId: 'rest-1',
      checkoutSessionId: 'chk-1',
      amount: 5000,
      reason: 'rejected',
    });

    await Promise.resolve();

    expect(publishDeduped).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.PaymentFailed,
        correlationId: 'chk-1',
        payload: {
          checkoutSessionId: 'chk-1',
          amount: 5000,
          reason: 'rejected',
        },
      }),
      60,
    );
  });

  it('publishes PaymentRecovered', async () => {
    await service.publishPaymentRecovered({
      restaurantId: 'rest-1',
      orderId: 'ord-1',
      orderNumber: '1042',
      amount: 5000,
    });

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.PaymentRecovered,
        correlationId: 'ord-1',
        payload: {
          orderId: 'ord-1',
          orderNumber: '1042',
          amount: 5000,
        },
      }),
    );
  });
});
