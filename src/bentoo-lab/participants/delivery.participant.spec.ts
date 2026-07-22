import { DeliveryParticipant } from './delivery.participant';

describe('DeliveryParticipant', () => {
  it('crea pedido domicilio con zona y agrega ítems a cocina', async () => {
    const http = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          order: {
            id: 'order-1',
            orderNumber: 'OD-1',
            status: 'CONFIRMED',
            total: 1500,
          },
        })
        .mockResolvedValueOnce({
          dishes: [{ id: 'dish-1', name: 'Pizza muzzarella' }],
        })
        .mockResolvedValueOnce({
          order: {
            id: 'order-1',
            orderNumber: 'OD-1',
            status: 'PREPARING',
            total: 9500,
          },
        }),
    };
    const participant = new DeliveryParticipant(http as never);
    const ctx = {
      runId: 'run-1',
      restaurantId: 'rest-1',
      jwt: 'waiter-token',
      simulatedNow: new Date('2026-07-17T23:01:00.000Z'),
      correlationId: 'corr-1',
      deliveryZoneId: 'zone-1',
    };

    const created = await participant.createOrder(ctx, {
      deliveryAddress: 'Calle Lab 100',
    });
    expect(created.order.id).toBe('order-1');
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/restaurants/rest-1/floor/salon-delivery-orders',
        method: 'POST',
        body: expect.objectContaining({
          deliveryZoneId: 'zone-1',
          paymentMethod: 'cash',
        }),
      }),
    );

    const withItems = await participant.addItems(ctx, {
      orderId: 'order-1',
      dishName: 'Pizza muzzarella',
      quantity: 1,
    });
    expect(withItems.order.status).toBe('PREPARING');
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/restaurants/rest-1/floor/salon-delivery-orders/order-1/items',
        body: expect.objectContaining({
          items: [
            expect.objectContaining({
              dishId: 'dish-1',
              sendToKitchen: true,
            }),
          ],
        }),
      }),
    );
  });
});
