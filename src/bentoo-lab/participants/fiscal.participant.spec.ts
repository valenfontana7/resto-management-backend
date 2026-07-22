import { FiscalParticipant } from './fiscal.participant';

describe('FiscalParticipant', () => {
  it('emite fiscal para un pedido usando el endpoint de floor con token manager', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        id: 'fiscal-1',
        cae: '12345678901234',
        status: 'AUTHORIZED',
      }),
    };
    const participant = new FiscalParticipant(http as never);
    const ctx = {
      runId: 'run-1',
      restaurantId: 'rest-1',
      jwt: 'manager-token',
      simulatedNow: new Date('2026-07-21T20:10:00.000Z'),
      correlationId: 'corr-1',
    };

    const issued = await participant.issueForOrder(ctx, {
      orderId: 'order-1',
      customerName: 'Cliente Fiscal',
    });

    expect(issued).toEqual({
      id: 'fiscal-1',
      cae: '12345678901234',
      status: 'AUTHORIZED',
    });
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/restaurants/rest-1/floor/fiscal/orders/order-1/issue',
        method: 'POST',
        jwt: 'manager-token',
        participantKey: 'manager',
        body: {
          type: 'FACTURA_B',
          customerName: 'Cliente Fiscal',
          customerDocType: 'DNI',
          customerDocNumber: '30111222',
        },
      }),
    );
  });
});
