import { DeliveryBusinessEventsService } from './delivery-business-events.service';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

describe('DeliveryBusinessEventsService', () => {
  const publish = jest.fn().mockResolvedValue(undefined);
  const publisher = { publish } as unknown as BusinessEventPublisherService;
  const service = new DeliveryBusinessEventsService(publisher);

  beforeEach(() => {
    publish.mockClear();
  });

  it('publishes DeliveryAssigned', async () => {
    service.publishDeliveryAssigned({
      restaurantId: 'rest-1',
      orderId: 'ord-1',
      orderNumber: '1042',
      driverId: 'drv-1',
      driverName: 'Juan',
    });

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.DeliveryAssigned,
        correlationId: 'ord-1',
        payload: {
          orderId: 'ord-1',
          orderNumber: '1042',
          driverId: 'drv-1',
          driverName: 'Juan',
        },
      }),
    );
  });

  it('publishes DeliveryCompleted', async () => {
    service.publishDeliveryCompleted({
      restaurantId: 'rest-1',
      orderId: 'ord-1',
      orderNumber: '1042',
      driverName: 'Juan',
    });

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.DeliveryCompleted,
      }),
    );
  });
});
