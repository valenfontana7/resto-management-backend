import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

interface LabReservation {
  id: string;
  status: string;
  date: string | Date;
  time: string;
  partySize: number;
}

export interface ReservationParticipantContext {
  runId: string;
  restaurantId: string;
  simulatedNow: Date;
  correlationId: string;
}

@Injectable()
export class ReservationParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async create(
    ctx: ReservationParticipantContext,
    input: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      partySize: number;
      time: string;
    },
  ): Promise<{ reservation: LabReservation }> {
    const date = this.resolveBookableDate(ctx.simulatedNow);
    return this.http.request<{ reservation: LabReservation }>({
      path: `/api/restaurants/${ctx.restaurantId}/reservations`,
      method: 'POST',
      runId: ctx.runId,
      participantKey: 'system',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        customer: {
          name: input.customerName,
          phone: input.customerPhone,
          email: input.customerEmail ?? 'lab-reserva@bentoo.invalid',
        },
        date,
        time: input.time,
        partySize: input.partySize,
        notes: 'Reserva creada por Bentoo Lab',
      },
    });
  }

  /** createPublic rechaza fechas en el pasado wall-clock. */
  private resolveBookableDate(simulatedNow: Date): string {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const simulatedDay = new Date(
      `${simulatedNow.toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const chosen =
      simulatedDay.getTime() > tomorrow.getTime() ? simulatedDay : tomorrow;
    return chosen.toISOString().slice(0, 10);
  }
}
