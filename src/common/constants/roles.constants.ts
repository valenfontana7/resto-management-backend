/**
 * Catálogo operativo de roles del restaurante.
 * Fuente de verdad para permisos de roles de sistema (isSystemRole).
 *
 * Jerarquía operativa:
 * - OWNER: dueño — configuración, facturación, equipo, todo el local
 * - MANAGER: gerente — operación diaria sin tocar suscripción/branding global
 * - WAITER: salón — mesas, pedidos, reservas (cobro si modo unificado)
 * - CASHIER: cajero — cobro en piso, caja parcial y comprobantes
 * - KITCHEN: cocina — tablero y estados de preparación
 * - DELIVERY: reparto — entregas y repartidores
 */

export type SystemRoleCode =
  | 'OWNER'
  | 'MANAGER'
  | 'WAITER'
  | 'CASHIER'
  | 'KITCHEN'
  | 'DELIVERY';

export type PermissionKey =
  | 'all'
  | 'dashboard'
  | 'orders'
  | 'reservations'
  | 'menu'
  | 'reports'
  | 'analytics'
  | 'tables'
  | 'kitchen'
  | 'delivery'
  | 'promotions'
  | 'settings'
  | 'billing'
  | 'branding'
  | 'salon'
  | 'cashier';

export interface SystemRoleDefinition {
  code: SystemRoleCode;
  /** Nombres históricos en DB que deben converger a `code` */
  legacyNames: string[];
  displayName: string;
  description: string;
  color: string;
  permissions: PermissionKey[];
}

export const SYSTEM_ROLE_DEFINITIONS: SystemRoleDefinition[] = [
  {
    code: 'OWNER',
    legacyNames: ['Admin', 'Administrador', 'Administrator', 'OWNER', 'Owner'],
    displayName: 'Dueño',
    description:
      'Acceso total: configuración, facturación, equipo y operación del local.',
    color: '#ef4444',
    permissions: ['all'],
  },
  {
    code: 'MANAGER',
    legacyNames: ['Manager', 'Gerente', 'MANAGER'],
    displayName: 'Gerente',
    description:
      'Operación diaria: menú, reportes, salón, cocina y delivery. Sin facturación SaaS ni branding.',
    color: '#f59e0b',
    permissions: [
      'dashboard',
      'orders',
      'reservations',
      'menu',
      'reports',
      'analytics',
      'tables',
      'salon',
      'cashier',
      'kitchen',
      'delivery',
      'promotions',
    ],
  },
  {
    code: 'WAITER',
    legacyNames: ['Waiter', 'Mozo', 'Mesero', 'WAITER'],
    displayName: 'Mozo',
    description:
      'Salón: pedidos, mesas y reservas. Cobro solo en modo unificado.',
    color: '#3b82f6',
    permissions: [
      'dashboard',
      'orders',
      'reservations',
      'tables',
      'salon',
      'cashier',
    ],
  },
  {
    code: 'CASHIER',
    legacyNames: ['Cashier', 'Cajero', 'Cajera', 'CASHIER'],
    displayName: 'Cajero',
    description: 'Cobro en piso, caja parcial y comprobantes fiscales.',
    color: '#059669',
    permissions: ['dashboard', 'salon', 'cashier'],
  },
  {
    code: 'KITCHEN',
    legacyNames: ['Kitchen', 'Cocina', 'Cocinero', 'Chef', 'CHEF', 'KITCHEN'],
    displayName: 'Cocina',
    description: 'Tablero de cocina y avance de comandas.',
    color: '#8b5cf6',
    permissions: ['kitchen'],
  },
  {
    code: 'DELIVERY',
    legacyNames: ['Delivery', 'Reparto', 'Repartidor', 'DELIVERY'],
    displayName: 'Reparto',
    description: 'Pedidos de delivery y repartidores.',
    color: '#10b981',
    permissions: ['delivery'],
  },
];

/** Roles con acceso completo al panel (bypass de permisos granulares). */
export const PRIVILEGED_ROLE_CODES = new Set<string>([
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
]);

/** Quién puede operar caja mayor / depósitos. */
export const MAIN_CASH_ROLE_CODES = new Set<string>([
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
  'MANAGER',
]);
