import { OrderStatus } from '../../orders/dto/order.dto';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'pendiente',
  [OrderStatus.PAID]: 'pagado',
  [OrderStatus.CONFIRMED]: 'confirmado',
  [OrderStatus.PREPARING]: 'en preparación',
  [OrderStatus.READY]: 'listo',
  [OrderStatus.DELIVERED]: 'entregado',
  [OrderStatus.CANCELLED]: 'cancelado',
};

export function formatOrderStatusLabel(
  status: string | null | undefined,
  options?: { sentenceCase?: boolean },
): string {
  if (!status) return 'sin estado';
  const normalized = status.toUpperCase() as OrderStatus;
  const label = ORDER_STATUS_LABELS[normalized] ?? status.toLowerCase();
  if (options?.sentenceCase === false) return label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
