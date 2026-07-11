export type CriticalIncidentKind =
  | 'payment_failed'
  | 'payment_refunded'
  | 'order_cancelled_paid'
  | 'fiscal_rejected'
  | 'checkout_failed'
  | 'menu_auto_disabled';

export interface CriticalIncidentBreakdown {
  paymentFailed: number;
  paymentRefunded: number;
  orderCancelledPaid: number;
  fiscalRejected: number;
  checkoutFailed: number;
  menuAutoDisabled: number;
}

export interface CriticalIncidentRow {
  id: string;
  kind: CriticalIncidentKind;
  label: string;
  summary: string;
  occurredAt: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
}

export const CRITICAL_INCIDENT_KIND_LABELS: Record<
  CriticalIncidentKind,
  string
> = {
  payment_failed: 'Pago fallido',
  payment_refunded: 'Pago reembolsado',
  order_cancelled_paid: 'Pedido cancelado cobrado',
  fiscal_rejected: 'Factura rechazada',
  checkout_failed: 'Checkout fallido',
  menu_auto_disabled: 'Plato fuera por stock',
};

export function sumCriticalIncidentBreakdown(
  breakdown: CriticalIncidentBreakdown,
): number {
  return (
    breakdown.paymentFailed +
    breakdown.paymentRefunded +
    breakdown.orderCancelledPaid +
    breakdown.fiscalRejected +
    breakdown.checkoutFailed +
    breakdown.menuAutoDisabled
  );
}

export function mergeRecentCriticalIncidents(
  rows: CriticalIncidentRow[],
  limit = 12,
): CriticalIncidentRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )
    .slice(0, limit);
}

export function formatIncidentAmountCents(totalCents: number): string {
  return `$${(totalCents / 100).toLocaleString('es-AR')}`;
}

export function buildOrderIncidentSummary(order: {
  orderNumber: string;
  paymentStatus: string;
  status: string;
  total: number;
}): string {
  const amount = formatIncidentAmountCents(order.total);
  if (order.paymentStatus === 'FAILED') {
    return `Pedido ${order.orderNumber} · ${amount}`;
  }
  if (order.paymentStatus === 'REFUNDED') {
    return `Pedido ${order.orderNumber} · reembolso ${amount}`;
  }
  if (order.status === 'CANCELLED' && order.paymentStatus === 'PAID') {
    return `Pedido ${order.orderNumber} cancelado tras cobro · ${amount}`;
  }
  return `Pedido ${order.orderNumber}`;
}

export function resolveOrderIncidentKind(order: {
  paymentStatus: string;
  status: string;
}): CriticalIncidentKind {
  if (order.paymentStatus === 'FAILED') return 'payment_failed';
  if (order.paymentStatus === 'REFUNDED') return 'payment_refunded';
  return 'order_cancelled_paid';
}
