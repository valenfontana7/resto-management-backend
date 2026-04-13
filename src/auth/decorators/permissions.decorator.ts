import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to require specific permissions on a route.
 * Permissions are module-level strings (e.g. 'menu', 'orders', 'tables').
 * The user's role must include at least one of the required permissions.
 *
 * Usage:
 *   @Permissions('menu')           — requires 'menu' permission
 *   @Permissions('orders', 'menu') — requires 'orders' OR 'menu'
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
