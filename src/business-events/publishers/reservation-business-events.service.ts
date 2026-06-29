import { Injectable } from '@nestjs/common';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

type ReservationSnapshot = {
  id: string;
  customerName: string;
  date: Date;
  time: string;
  partySize: number;
};

@Injectable()
export class ReservationBusinessEventsService {
  constructor(private readonly publisher: BusinessEventPublisherService) {}

  publishReservationCreated(
    restaurantId: string,
    reservation: ReservationSnapshot,
    channel: 'public' | 'admin',
    source = 'reservations',
  ): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.ReservationCreated,
        restaurantId,
        source,
        correlationId: reservation.id,
        payload: {
          reservationId: reservation.id,
          customerName: reservation.customerName,
          date: reservation.date.toISOString().slice(0, 10),
          time: reservation.time,
          partySize: reservation.partySize,
          channel,
        },
      })
      .catch(() => undefined);
  }

  publishReservationCancelled(
    restaurantId: string,
    reservation: ReservationSnapshot,
    source = 'reservations',
  ): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.ReservationCancelled,
        restaurantId,
        source,
        correlationId: reservation.id,
        payload: {
          reservationId: reservation.id,
          customerName: reservation.customerName,
          date: reservation.date.toISOString().slice(0, 10),
          time: reservation.time,
          partySize: reservation.partySize,
        },
      })
      .catch(() => undefined);
  }

  publishReservationConfirmed(
    restaurantId: string,
    reservation: ReservationSnapshot,
    source = 'reservations',
  ): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.ReservationConfirmed,
        restaurantId,
        source,
        correlationId: reservation.id,
        payload: {
          reservationId: reservation.id,
          customerName: reservation.customerName,
          date: reservation.date.toISOString().slice(0, 10),
          time: reservation.time,
          partySize: reservation.partySize,
        },
      })
      .catch(() => undefined);
  }

  publishReservationNoShow(
    restaurantId: string,
    reservation: ReservationSnapshot,
    source = 'reservations',
  ): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.ReservationNoShow,
        restaurantId,
        source,
        correlationId: reservation.id,
        payload: {
          reservationId: reservation.id,
          customerName: reservation.customerName,
          date: reservation.date.toISOString().slice(0, 10),
          time: reservation.time,
          partySize: reservation.partySize,
        },
      })
      .catch(() => undefined);
  }
}
