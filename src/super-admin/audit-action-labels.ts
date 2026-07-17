/**
 * Etiquetas en español para acciones del audit log de Master.
 * Códigos internos en DB; la UI/API de inbox no deben exponer SCREAMING_SNAKE.
 */

const MASTER_AUDIT_ACTION_LABELS: Record<string, string> = {
  IMPERSONATE: 'Entrar al local',
  CREATE_USER: 'Usuario creado',
  UPDATE_USER: 'Usuario actualizado',
  DELETE_USER: 'Usuario eliminado',
  CREATE_RESTAURANT: 'Restaurante creado',
  UPDATE_RESTAURANT: 'Restaurante actualizado',
  DELETE_RESTAURANT: 'Restaurante eliminado',
  CHANGE_STATUS: 'Estado del local cambiado',
  UPDATE_SUBSCRIPTION: 'Suscripción actualizada',
  CHANGE_SUBSCRIPTION_PLAN: 'Plan de suscripción cambiado',
  CHANGE_PLAN: 'Plan cambiado',
  CANCEL_SUBSCRIPTION: 'Suscripción cancelada',
  REACTIVATE_SUBSCRIPTION: 'Suscripción reactivada',
  ENABLE_TRIAL: 'Prueba activada',
  DISABLE_TRIAL: 'Prueba desactivada',
  UPDATE_BILLING_CONTROLS: 'Controles de cobro actualizados',
  UPDATE_SYSTEM_SETTINGS: 'Ajustes de plataforma actualizados',
  CREATE_MANUAL_ORDER: 'Pedido manual creado',
  DELETE_DEMO_EXAMPLE: 'Demo eliminada',
  CREATE_DEMO_EXAMPLE: 'Demo creada',
  UPDATE_DEMO_EXAMPLE: 'Demo actualizada',
};

export function formatMasterAuditAction(
  action: string | null | undefined,
): string {
  if (!action?.trim()) return 'Acción de soporte';
  const key = action.trim().toUpperCase();
  if (MASTER_AUDIT_ACTION_LABELS[key]) return MASTER_AUDIT_ACTION_LABELS[key];

  const soft = key.toLowerCase().split('_').filter(Boolean).join(' ');
  return soft
    ? soft.charAt(0).toUpperCase() + soft.slice(1)
    : 'Acción de soporte';
}
