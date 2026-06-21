import { NotificationChannel } from '@prisma/client';

export type OrderNotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'ORDER_CANCELLED'
  | 'ORDER_READY';

/** Roles de plataforma: no reciben alertas operativas de restaurantes. */
export const PLATFORM_STAFF_ROLES = new Set(['SUPER_ADMIN']);

/**
 * Email solo en eventos que requieren acción inmediata.
 * Cambios de estado rutinarios → in-app + push.
 */
export function resolveOrderNotificationChannels(
  type: OrderNotificationType,
): NotificationChannel[] {
  const realtime = [NotificationChannel.IN_APP, NotificationChannel.PUSH];

  if (type === 'ORDER_CREATED' || type === 'ORDER_CANCELLED') {
    return [...realtime, NotificationChannel.EMAIL];
  }

  return realtime;
}

export function isPlatformStaffRole(roleName?: string | null): boolean {
  return Boolean(roleName && PLATFORM_STAFF_ROLES.has(roleName));
}

/**
 * ¿Debe recibir alertas operativas de pedidos de un restaurante?
 *
 * SUPER_ADMIN en membership no-default = acceso de soporte → sin spam.
 * SUPER_ADMIN en su membership default (restaurante propio) → sí recibe.
 */
export function shouldReceiveRestaurantOrderAlerts(options: {
  roleName?: string | null;
  viaMembership?: boolean;
  isDefaultMembership?: boolean;
}): boolean {
  const {
    roleName,
    viaMembership = false,
    isDefaultMembership = false,
  } = options;

  if (!isPlatformStaffRole(roleName)) return true;
  if (viaMembership && isDefaultMembership) return true;
  return false;
}
