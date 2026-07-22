import { ReservationParticipant } from './reservation.participant';

describe('ReservationParticipant', () => {
  it('crea reserva pública con fecha bookable', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        reservation: {
          id: 'res-1',
          status: 'PENDING',
          date: '2099-01-01',
          time: '20:30',
          partySize: 4,
        },
      }),
    };
    const participant = new ReservationParticipant(http as never);
    const result = await participant.create(
      {
        runId: 'run-1',
        restaurantId: 'rest-1',
        simulatedNow: new Date('2026-07-17T23:00:00.000Z'),
        correlationId: 'corr-1',
      },
      {
        customerName: 'Cliente Lab',
        customerPhone: '+54 11 5555-0300',
        partySize: 4,
        time: '20:30',
      },
    );

    expect(result.reservation.id).toBe('res-1');
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/restaurants/rest-1/reservations',
        method: 'POST',
        body: expect.objectContaining({
          time: '20:30',
          partySize: 4,
          customer: expect.objectContaining({ name: 'Cliente Lab' }),
        }),
      }),
    );
    const body = http.request.mock.calls[0][0].body as { date: string };
    expect(body.date >= new Date().toISOString().slice(0, 10)).toBe(true);
  });
});
