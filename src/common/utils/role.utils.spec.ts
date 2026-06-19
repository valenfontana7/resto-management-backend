import {
  normalizeRoleCode,
  normalizePermissionList,
  roleHasAnyPermission,
  roleMeetsRequirement,
  isPrivilegedRole,
} from './role.utils';

describe('role.utils', () => {
  describe('normalizeRoleCode', () => {
    it('maps legacy Admin to OWNER', () => {
      expect(normalizeRoleCode('Admin')).toBe('OWNER');
      expect(normalizeRoleCode('ADMIN')).toBe('OWNER');
      expect(normalizeRoleCode({ name: 'Admin' })).toBe('OWNER');
    });

    it('maps friendly Spanish names', () => {
      expect(normalizeRoleCode('Mozo')).toBe('WAITER');
      expect(normalizeRoleCode('Cocina')).toBe('KITCHEN');
      expect(normalizeRoleCode('Repartidor')).toBe('DELIVERY');
    });
  });

  describe('normalizePermissionList', () => {
    it('maps legacy permission keys', () => {
      expect(normalizePermissionList(['manage_menu', 'view_orders'])).toEqual([
        'menu',
        'orders',
      ]);
    });

    it('strips orders from KITCHEN role', () => {
      expect(normalizePermissionList(['orders', 'kitchen'], 'KITCHEN')).toEqual(
        ['kitchen'],
      );
    });
  });

  describe('roleHasAnyPermission', () => {
    it('grants privileged roles everything', () => {
      expect(roleHasAnyPermission('OWNER', [], ['settings'])).toBe(true);
      expect(roleHasAnyPermission('Admin', [], ['billing'])).toBe(true);
    });

    it('checks granular permissions for waiter', () => {
      expect(
        roleHasAnyPermission(
          'WAITER',
          ['dashboard', 'orders', 'salon'],
          ['salon'],
        ),
      ).toBe(true);
      expect(
        roleHasAnyPermission('WAITER', ['orders', 'tables'], ['settings']),
      ).toBe(false);
    });
  });

  describe('roleMeetsRequirement', () => {
    it('treats Admin as OWNER for owner-only checks', () => {
      expect(roleMeetsRequirement('Admin', 'OWNER')).toBe(true);
      expect(roleMeetsRequirement('MANAGER', 'OWNER')).toBe(false);
    });
  });

  describe('isPrivilegedRole', () => {
    it('recognizes owner aliases', () => {
      expect(isPrivilegedRole('OWNER')).toBe(true);
      expect(isPrivilegedRole('Admin')).toBe(true);
      expect(isPrivilegedRole('WAITER')).toBe(false);
    });
  });
});
