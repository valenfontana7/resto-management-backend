import {
  PRIVILEGED_ROLE_CODES,
  MAIN_CASH_ROLE_CODES,
  SYSTEM_ROLE_DEFINITIONS,
  type PermissionKey,
  type SystemRoleCode,
} from '../constants/roles.constants';

const LEGACY_PERMISSION_ALIASES: Record<string, PermissionKey[]> = {
  manage_menu: ['menu'],
  manage_orders: ['orders'],
  view_orders: ['orders'],
  take_orders: ['orders'],
  update_order_status: ['orders', 'kitchen'],
  view_reports: ['reports'],
  manage_tables: ['tables'],
  view_tables: ['tables'],
  manage_reservations: ['reservations'],
  view_delivery_orders: ['delivery'],
  update_delivery_status: ['delivery'],
  manage_payments: ['billing'],
  manage_branding: ['branding'],
  manage_settings: ['settings'],
  manage_promotions: ['promotions'],
};

const CANONICAL_PERMISSIONS = new Set<string>([
  'all',
  'dashboard',
  'orders',
  'reservations',
  'menu',
  'reports',
  'analytics',
  'tables',
  'kitchen',
  'delivery',
  'promotions',
  'settings',
  'billing',
  'branding',
  'salon',
  'cashier',
]);

export function normalizeRoleCode(roleName?: string | null): string | null {
  if (!roleName) return null;
  const normalized = roleName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();

  const direct: Record<string, string> = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    OWNER: 'OWNER',
    ADMIN: 'OWNER',
    MANAGER: 'MANAGER',
    WAITER: 'WAITER',
    CHEF: 'KITCHEN',
    KITCHEN: 'KITCHEN',
    DELIVERY: 'DELIVERY',
    ADMINISTRATOR: 'OWNER',
    ADMINISTRADOR: 'OWNER',
    GERENTE: 'MANAGER',
    MOZO: 'WAITER',
    MESERO: 'WAITER',
    COCINA: 'KITCHEN',
    COCINERO: 'KITCHEN',
    REPARTO: 'DELIVERY',
    REPARTIDOR: 'DELIVERY',
  };

  if (direct[normalized]) return direct[normalized];

  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    if (
      def.legacyNames.some(
        (legacy) =>
          legacy.toUpperCase() === normalized || legacy === roleName.trim(),
      )
    ) {
      return def.code;
    }
  }

  return normalized;
}

export function isPrivilegedRole(roleName?: string | null): boolean {
  const code = normalizeRoleCode(roleName);
  return !!code && PRIVILEGED_ROLE_CODES.has(code);
}

export function canManageMainCash(roleName?: string | null): boolean {
  const code = normalizeRoleCode(roleName);
  return !!code && MAIN_CASH_ROLE_CODES.has(code);
}

export function roleMeetsRequirement(
  userRoleName: string | null | undefined,
  requiredRole: string,
): boolean {
  const userCode = normalizeRoleCode(userRoleName);
  const requiredCode = normalizeRoleCode(requiredRole);
  if (!userCode || !requiredCode) return false;
  if (userCode === 'SUPER_ADMIN') return true;
  if (requiredCode === 'OWNER') {
    return userCode === 'OWNER';
  }
  return userCode === requiredCode;
}

export function getSystemRoleDefinition(
  code: SystemRoleCode,
): (typeof SYSTEM_ROLE_DEFINITIONS)[number] | undefined {
  return SYSTEM_ROLE_DEFINITIONS.find((def) => def.code === code);
}

export function findSystemRoleByLegacyName(
  roleName: string,
): (typeof SYSTEM_ROLE_DEFINITIONS)[number] | undefined {
  const code = normalizeRoleCode(roleName);
  if (!code) return undefined;
  return SYSTEM_ROLE_DEFINITIONS.find((def) => def.code === code);
}

export function normalizePermissionList(
  permissions: unknown,
  roleCode?: string | null,
): string[] {
  const raw = Array.isArray(permissions)
    ? permissions.filter((p): p is string => typeof p === 'string')
    : typeof permissions === 'string'
      ? [permissions]
      : [];

  if (raw.includes('all')) return ['all'];

  const normalized = new Set<string>();
  for (const perm of raw) {
    const lower = perm.trim().toLowerCase();
    if (CANONICAL_PERMISSIONS.has(lower)) {
      normalized.add(lower);
      continue;
    }
    const mapped = LEGACY_PERMISSION_ALIASES[lower] ?? [];
    for (const item of mapped) {
      normalized.add(item);
    }
  }

  let result = Array.from(normalized);

  if (roleCode === 'KITCHEN' && result.includes('orders')) {
    result = result.filter((p) => p !== 'orders');
    if (!result.includes('kitchen')) result.push('kitchen');
  }

  if (roleCode === 'DELIVERY' && result.includes('orders')) {
    result = result.filter((p) => p !== 'orders');
    if (!result.includes('delivery')) result.push('delivery');
  }

  return result;
}

export function roleHasAnyPermission(
  roleName: string | null | undefined,
  rolePermissions: unknown,
  required: string[],
): boolean {
  if (isPrivilegedRole(roleName)) return true;

  const code = normalizeRoleCode(roleName);
  const normalized = normalizePermissionList(rolePermissions, code);
  if (normalized.includes('all')) return true;

  return required.some((perm) => normalized.includes(perm));
}
