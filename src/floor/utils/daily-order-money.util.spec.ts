import { OrderStatus, PaymentStatus } from '@prisma/client';
import {
  OPEN_KITCHEN_ORDER_STATUSES,
  openKitchenOrderWhere,
  paidOrderWhere,
  unpaidOpenOrderWhere,
} from './daily-order-money.util';

describe('daily-order-money.util', () => {
  const restaurantId = 'rest-1';
  const start = new Date('2026-07-17T00:00:00.000Z');
  const end = new Date('2026-07-17T23:59:59.999Z');

  it('paidOrderWhere filtra PAID y excluye cancelados', () => {
    expect(paidOrderWhere(restaurantId, start, end)).toEqual({
      restaurantId,
      createdAt: { gte: start, lte: end },
      status: { not: OrderStatus.CANCELLED },
      paymentStatus: PaymentStatus.PAID,
    });
  });

  it('unpaidOpenOrderWhere incluye PENDING y FAILED', () => {
    expect(unpaidOpenOrderWhere(restaurantId, start, end)).toEqual({
      restaurantId,
      createdAt: { gte: start, lte: end },
      status: { not: OrderStatus.CANCELLED },
      paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
    });
  });

  it('openKitchenOrderWhere cubre estados de servicio abierto', () => {
    expect(OPEN_KITCHEN_ORDER_STATUSES).toEqual([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ]);
    expect(openKitchenOrderWhere(restaurantId, start, end)).toEqual({
      restaurantId,
      createdAt: { gte: start, lte: end },
      status: { in: OPEN_KITCHEN_ORDER_STATUSES },
    });
  });
});
