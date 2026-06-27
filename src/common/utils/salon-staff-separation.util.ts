import {
  canManageMainCash,
  isPrivilegedRole,
  normalizeRoleCode,
  roleHasAnyPermission,
  type RoleLike,
} from './role.utils';

export type SalonStaffSeparationMode = 'unified' | 'separated';

const COLLECT_ROLE_CODES = new Set(['CASHIER']);

export function getSalonStaffSeparationMode(
  businessRules: unknown,
): SalonStaffSeparationMode {
  const rules = businessRules as {
    salon?: { staffSeparation?: string };
  } | null;
  return rules?.salon?.staffSeparation === 'separated'
    ? 'separated'
    : 'unified';
}

export function mergeSalonStaffSeparation(
  businessRules: unknown,
  mode: SalonStaffSeparationMode,
): Record<string, unknown> {
  const current =
    businessRules && typeof businessRules === 'object'
      ? (businessRules as Record<string, unknown>)
      : {};
  const currentSalon =
    current.salon && typeof current.salon === 'object'
      ? (current.salon as Record<string, unknown>)
      : {};

  return {
    ...current,
    salon: {
      ...currentSalon,
      staffSeparation: mode,
    },
  };
}

/**
 * ¿Puede cobrar mesas, operar caja parcial y comprobantes fiscales en salón?
 * En modo `unified` (default) el mozo mantiene permiso `cashier`.
 * En modo `separated` solo cajero, gerente y dueño.
 */
export function canUserCollectOnFloor(
  roleName: RoleLike,
  rolePermissions: unknown,
  businessRules: unknown,
): boolean {
  if (isPrivilegedRole(roleName)) return true;
  if (canManageMainCash(roleName)) return true;

  const mode = getSalonStaffSeparationMode(businessRules);
  if (mode === 'unified') {
    return roleHasAnyPermission(roleName, rolePermissions, ['cashier']);
  }

  const code = normalizeRoleCode(roleName);
  if (code && COLLECT_ROLE_CODES.has(code)) return true;
  return false;
}

export const SALON_COLLECT_DENIED_MESSAGE =
  'En este local solo el cajero puede cobrar. Pedile ayuda al mostrador.';
