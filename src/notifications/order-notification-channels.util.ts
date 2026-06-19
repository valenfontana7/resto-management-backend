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
