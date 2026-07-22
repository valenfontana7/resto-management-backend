import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

/** Pedidos que aún no terminaron cocina/entrega (bloquean cierre diario). */
export const OPEN_KITCHEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

export function paidOrderWhere(
  restaurantId: string,
  start: Date,
  end: Date,
): Prisma.OrderWhereInput {
  return {
    restaurantId,
    createdAt: { gte: start, lte: end },
    status: { not: OrderStatus.CANCELLED },
    paymentStatus: PaymentStatus.PAID,
  };
}

export function unpaidOpenOrderWhere(
  restaurantId: string,
  start: Date,
  end: Date,
): Prisma.OrderWhereInput {
  return {
    restaurantId,
    createdAt: { gte: start, lte: end },
    status: { not: OrderStatus.CANCELLED },
    paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
  };
}

export function openKitchenOrderWhere(
  restaurantId: string,
  start: Date,
  end: Date,
): Prisma.OrderWhereInput {
  return {
    restaurantId,
    createdAt: { gte: start, lte: end },
    status: { in: OPEN_KITCHEN_ORDER_STATUSES },
  };
}
