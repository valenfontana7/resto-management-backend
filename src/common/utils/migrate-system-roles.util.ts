import { Prisma, PrismaClient } from '@prisma/client';
import {
  SYSTEM_ROLE_DEFINITIONS,
  type SystemRoleCode,
} from '../constants/roles.constants';
import { normalizeRoleCode } from './role.utils';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface RoleMigrationStats {
  rolesUpdated: number;
  rolesCreated: number;
  rolesMerged: number;
  usersReassigned: number;
  membershipsReassigned: number;
}

export interface MigrateRestaurantRolesOptions {
  dryRun?: boolean;
}

const SYSTEM_ROLE_CODES = new Set<SystemRoleCode>(
  SYSTEM_ROLE_DEFINITIONS.map((def) => def.code),
);

function permissionsEqual(a: unknown, b: string[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pickKeeperRole(
  matches: Array<{
    id: string;
    name: string;
    permissions: unknown;
    color: string;
    isSystemRole: boolean;
    createdAt: Date;
    _count?: { users: number; memberships: number };
  }>,
  code: SystemRoleCode,
) {
  return [...matches].sort((a, b) => {
    if (a.name === code && b.name !== code) return -1;
    if (b.name === code && a.name !== code) return 1;
    if (a.isSystemRole !== b.isSystemRole) return a.isSystemRole ? -1 : 1;
    const aUsers = a._count?.users ?? 0;
    const bUsers = b._count?.users ?? 0;
    if (aUsers !== bUsers) return bUsers - aUsers;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

function roleMatchesSystemCode(
  roleName: string,
  code: SystemRoleCode,
): boolean {
  const normalized = normalizeRoleCode(roleName);
  return normalized === code && SYSTEM_ROLE_CODES.has(normalized);
}

/**
 * Migra los roles de sistema de un restaurante al catálogo canónico.
 * Fusiona duplicados legacy (p. ej. Admin + OWNER) reasignando usuarios.
 */
export async function migrateRestaurantSystemRoles(
  client: DbClient,
  restaurantId: string,
  options: MigrateRestaurantRolesOptions = {},
): Promise<RoleMigrationStats> {
  const { dryRun = false } = options;
  const stats: RoleMigrationStats = {
    rolesUpdated: 0,
    rolesCreated: 0,
    rolesMerged: 0,
    usersReassigned: 0,
    membershipsReassigned: 0,
  };

  const allRoles = await client.role.findMany({
    where: { restaurantId },
    include: {
      _count: { select: { users: true, memberships: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    const matches = allRoles.filter((role) =>
      roleMatchesSystemCode(role.name, def.code),
    );

    if (matches.length === 0) {
      if (!dryRun) {
        await client.role.create({
          data: {
            restaurantId,
            name: def.code,
            permissions: def.permissions,
            color: def.color,
            isSystemRole: true,
          },
        });
      }
      stats.rolesCreated++;
      continue;
    }

    const keeper = pickKeeperRole(matches, def.code);
    const duplicates = matches.filter((role) => role.id !== keeper.id);

    for (const duplicate of duplicates) {
      if (!dryRun) {
        const userUpdates = await client.user.updateMany({
          where: { roleId: duplicate.id },
          data: { roleId: keeper.id },
        });
        stats.usersReassigned += userUpdates.count;

        const membershipUpdates = await client.restaurantMembership.updateMany({
          where: { roleId: duplicate.id },
          data: { roleId: keeper.id },
        });
        stats.membershipsReassigned += membershipUpdates.count;

        await client.role.delete({ where: { id: duplicate.id } });
      } else {
        stats.usersReassigned += duplicate._count.users;
        stats.membershipsReassigned += duplicate._count.memberships;
      }
      stats.rolesMerged++;
    }

    const needsUpdate =
      keeper.name !== def.code ||
      keeper.isSystemRole !== true ||
      !permissionsEqual(keeper.permissions, def.permissions) ||
      keeper.color !== def.color;

    if (needsUpdate) {
      if (!dryRun) {
        await client.role.update({
          where: { id: keeper.id },
          data: {
            name: def.code,
            permissions: def.permissions,
            color: def.color,
            isSystemRole: true,
          },
        });
      }
      stats.rolesUpdated++;
    }
  }

  return stats;
}
