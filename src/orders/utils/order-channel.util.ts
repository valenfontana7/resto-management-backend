import { OrderSource } from '@prisma/client';

/** Teléfono placeholder usado en cobros de salón sin teléfono real. */
export const SALON_PLACEHOLDER_PHONE = '0000000000';

export function isSalonFloorOrder(order: {
  orderSource?: OrderSource | null;
  tableSessionId?: string | null;
}): boolean {
  return (
    order.orderSource === OrderSource.FLOOR_FINAL ||
    order.orderSource === OrderSource.FLOOR_COMANDA ||
    Boolean(order.tableSessionId)
  );
}

export function isOnlineCustomerOrder(order: {
  orderSource?: OrderSource | null;
  tableSessionId?: string | null;
}): boolean {
  return !isSalonFloorOrder(order);
}

/**
 * Clave estable para ranking de clientes online.
 * Devuelve null para pedidos de salón (no deben mezclarse con clientes web).
 */
export function getCustomerRankingKey(order: {
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  orderSource?: OrderSource | null;
  tableSessionId?: string | null;
}): string | null {
  if (isSalonFloorOrder(order)) return null;

  const phone = order.customerPhone?.replace(/\D/g, '') ?? '';
  if (phone && phone !== SALON_PLACEHOLDER_PHONE) {
    return `phone:${phone}`;
  }

  const email = order.customerEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const name = order.customerName?.trim().toLowerCase();
  if (name && !/^mesa\s+\S+/i.test(name)) {
    return `name:${name}`;
  }

  return null;
}

export function getSalonTableRankingKey(order: {
  tableId?: string | null;
  tableSessionId?: string | null;
  orderSource?: OrderSource | null;
}): string | null {
  if (!isSalonFloorOrder(order)) return null;
  if (order.orderSource !== OrderSource.FLOOR_FINAL) return null;
  return order.tableId ?? order.tableSessionId ?? null;
}
