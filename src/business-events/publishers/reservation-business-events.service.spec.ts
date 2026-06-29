import { ReservationBusinessEventsService } from './reservation-business-events.service';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

describe('ReservationBusinessEventsService', () => {
  const publish = jest.fn().mockResolvedValue(undefined);
  const publisher = { publish } as unknown as BusinessEventPublisherService;
  const service = new ReservationBusinessEventsService(publisher);

  const reservation = {
    id: 'res-1',
    customerName: 'Ana',
    date: new Date('2026-06-28T12:00:00.000Z'),
    time: '20:00',
    partySize: 4,
  };

  beforeEach(() => {
    publish.mockClear();
  });

  it('publishes ReservationCreated', async () => {
    service.publishReservationCreated('rest-1', reservation, 'public');

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.ReservationCreated,
        restaurantId: 'rest-1',
        correlationId: 'res-1',
        payload: expect.objectContaining({
          reservationId: 'res-1',
          customerName: 'Ana',
          channel: 'public',
          partySize: 4,
        }),
      }),
    );
  });

  it('publishes ReservationCancelled', async () => {
    service.publishReservationCancelled('rest-1', reservation);

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.ReservationCancelled,
        correlationId: 'res-1',
      }),
    );
  });

  it('publishes ReservationConfirmed', async () => {
    service.publishReservationConfirmed('rest-1', reservation);

    await Promise.resolve();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BentooBusinessEventType.ReservationConfirmed,
      }),
    );
  });
});
