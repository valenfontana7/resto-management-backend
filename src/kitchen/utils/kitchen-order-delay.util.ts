import { OrderStatus } from '@prisma/client';

/** SLA por defecto (minutos) si el pedido no trae estimatedTime. */
export const DEFAULT_KITCHEN_SLA_MINUTES = 20;

const TRACKABLE_STATUSES = new Set<string>([
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
]);

export type KitchenDelayFields = {
  isDelayed: boolean;
  minutesWaiting: number;
  kitchenSlaMinutes: number;
};

/**
 * Señal accionable de demora para cocina / encargado.
 * Usa confirmedAt (o createdAt) vs "ahora" y un SLA en minutos.
 */
export function computeKitchenDelay(input: {
  status: string;
  confirmedAt?: Date | string | null;
  createdAt: Date | string;
  estimatedTime?: number | null;
  now?: Date;
  slaMinutes?: number;
}): KitchenDelayFields {
  const status = String(input.status || '').toUpperCase();
  const sla =
    typeof input.estimatedTime === 'number' && input.estimatedTime > 0
      ? input.estimatedTime
      : (input.slaMinutes ?? DEFAULT_KITCHEN_SLA_MINUTES);

  if (!TRACKABLE_STATUSES.has(status)) {
    return { isDelayed: false, minutesWaiting: 0, kitchenSlaMinutes: sla };
  }

  const start = input.confirmedAt ?? input.createdAt;
  const startMs = new Date(start).getTime();
  const nowMs = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    return { isDelayed: false, minutesWaiting: 0, kitchenSlaMinutes: sla };
  }

  const minutesWaiting = Math.max(0, Math.floor((nowMs - startMs) / 60_000));
  return {
    isDelayed: minutesWaiting > sla,
    minutesWaiting,
    kitchenSlaMinutes: sla,
  };
}

export function enrichOrderWithKitchenDelay<
  T extends {
    status: string;
    confirmedAt?: Date | string | null;
    createdAt: Date | string;
    estimatedTime?: number | null;
  },
>(order: T, now?: Date): T & KitchenDelayFields {
  return {
    ...order,
    ...computeKitchenDelay({
      status: order.status,
      confirmedAt: order.confirmedAt,
      createdAt: order.createdAt,
      estimatedTime: order.estimatedTime,
      now,
    }),
  };
}
