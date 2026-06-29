import { MenuBusinessEventsService } from './menu-business-events.service';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

describe('MenuBusinessEventsService', () => {
  const publish = jest.fn().mockResolvedValue(undefined);
  const publisher = { publish } as unknown as BusinessEventPublisherService;
  const service = new MenuBusinessEventsService(publisher);

  beforeEach(() => {
    publish.mockClear();
  });

  it('publishes MenuUpdated with correlation id', async () => {
    service.publishMenuUpdated('rest-1', 'dish', 'dish-1', 'Milanesa');

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.MenuUpdated,
        restaurantId: 'rest-1',
        correlationId: 'dish:dish-1',
        payload: {
          changeType: 'dish',
          entityId: 'dish-1',
          entityName: 'Milanesa',
        },
      }),
    );
  });

  it('publishes PriceChanged when dish price updates', async () => {
    service.publishPriceChanged('rest-1', {
      id: 'dish-1',
      name: 'Milanesa',
      previousPrice: 1000,
      newPrice: 1200,
    });

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.PriceChanged,
        correlationId: 'dish-1',
        payload: {
          dishId: 'dish-1',
          dishName: 'Milanesa',
          previousPrice: 1000,
          newPrice: 1200,
        },
      }),
    );
  });
});
