import { migrateRestaurantSystemRoles } from './migrate-system-roles.util';

describe('migrateRestaurantSystemRoles', () => {
  it('creates missing system roles', async () => {
    const create = jest.fn().mockResolvedValue({});
    const client = {
      role: {
        findMany: jest.fn().mockResolvedValue([]),
        create,
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: { updateMany: jest.fn() },
      restaurantMembership: { updateMany: jest.fn() },
    };

    const stats = await migrateRestaurantSystemRoles(client as any, 'rest-1');

    expect(create).toHaveBeenCalledTimes(5);
    expect(stats.rolesCreated).toBe(5);
  });

  it('merges Admin and OWNER into canonical OWNER', async () => {
    const adminRole = {
      id: 'role-admin',
      name: 'Admin',
      permissions: ['all'],
      color: '#ef4444',
      isSystemRole: true,
      createdAt: new Date('2024-01-01'),
      _count: { users: 2, memberships: 1 },
    };
    const ownerRole = {
      id: 'role-owner',
      name: 'OWNER',
      permissions: ['all'],
      color: '#ef4444',
      isSystemRole: true,
      createdAt: new Date('2024-06-01'),
      _count: { users: 0, memberships: 0 },
    };
    const managerRole = {
      id: 'role-manager',
      name: 'Manager',
      permissions: ['orders'],
      color: '#f59e0b',
      isSystemRole: true,
      createdAt: new Date('2024-01-01'),
      _count: { users: 1, memberships: 0 },
    };

    const deleteMock = jest.fn().mockResolvedValue({});
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    const client = {
      role: {
        findMany: jest
          .fn()
          .mockResolvedValue([adminRole, ownerRole, managerRole]),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: deleteMock,
      },
      user: { updateMany: userUpdateMany },
      restaurantMembership: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const stats = await migrateRestaurantSystemRoles(client as any, 'rest-1');

    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'role-admin' } });
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { roleId: 'role-admin' },
      data: { roleId: 'role-owner' },
    });
    expect(stats.rolesMerged).toBe(1);
    expect(stats.usersReassigned).toBe(2);
  });

  it('does not write in dry-run mode', async () => {
    const client = {
      role: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: { updateMany: jest.fn() },
      restaurantMembership: { updateMany: jest.fn() },
    };

    const stats = await migrateRestaurantSystemRoles(client as any, 'rest-1', {
      dryRun: true,
    });

    expect(client.role.create).not.toHaveBeenCalled();
    expect(stats.rolesCreated).toBe(5);
  });
});
