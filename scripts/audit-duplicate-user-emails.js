require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

function normalizeEmailForStorage(email) {
  return email.trim().toLowerCase();
}

function getEmailCanonicalIdentity(email) {
  const normalized = normalizeEmailForStorage(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);

  if (domain === 'googlemail.com') {
    domain = 'gmail.com';
  }

  if (domain === 'gmail.com') {
    local = local.split('+')[0].replace(/\./g, '');
    return `${local}@${domain}`;
  }

  local = local.split('+')[0];
  return `${local}@${domain}`;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está configurada. Definila en .env antes de auditar.',
    );
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

function parseArgs() {
  const apply = process.argv.includes('--apply');
  const json = process.argv.includes('--json');
  const includeCanonical = !process.argv.includes('--exact-only');
  return { apply, json, includeCanonical };
}

function groupExactDuplicates(users) {
  const byEmail = new Map();

  for (const user of users) {
    const key = user.email.trim().toLowerCase();
    const group = byEmail.get(key) ?? [];
    group.push(user);
    byEmail.set(key, group);
  }

  return [...byEmail.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      kind: 'exact',
      users: sortUsersForKeep(group),
    }));
}

function groupCanonicalDuplicates(users) {
  const byIdentity = new Map();

  for (const user of users) {
    const key = getEmailCanonicalIdentity(user.email);
    const group = byIdentity.get(key) ?? [];
    group.push(user);
    byIdentity.set(key, group);
  }

  return [...byIdentity.entries()]
    .filter(([, group]) => {
      const distinctStored = new Set(
        group.map((user) => user.email.toLowerCase()),
      );
      return distinctStored.size > 1;
    })
    .map(([key, group]) => ({
      key,
      kind: 'canonical',
      users: sortUsersForKeep(group),
    }));
}

function sortUsersForKeep(users) {
  return [...users].sort((a, b) => {
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function formatUser(user) {
  const restaurant = user.restaurantId ?? 'sin-restaurante';
  const status = user.isActive ? 'activo' : 'inactivo';
  return [
    `  - ${user.id}`,
    `    email: ${user.email}`,
    `    nombre: ${user.name}`,
    `    creado: ${user.createdAt.toISOString()}`,
    `    restaurante: ${restaurant}`,
    `    estado: ${status}`,
  ].join('\n');
}

function printReport(groups) {
  if (groups.length === 0) {
    console.log('No se encontraron duplicados entre usuarios activos.');
    return;
  }

  console.log(`Grupos duplicados encontrados: ${groups.length}\n`);

  for (const group of groups) {
    const keep = group.users[0];
    const remove = group.users.slice(1);
    const label =
      group.kind === 'exact'
        ? `Email exacto: ${group.key}`
        : `Identidad canónica: ${group.key}`;

    console.log(`${label}`);
    console.log(`  Conservar: ${keep.id} (${keep.email})`);
    console.log(`  Soft-delete sugerido: ${remove.length}`);
    for (const user of group.users) {
      console.log(formatUser(user));
    }
    console.log('');
  }
}

async function applySoftDelete(prisma, groups) {
  const idsToDelete = new Set();

  for (const group of groups) {
    for (const user of group.users.slice(1)) {
      idsToDelete.add(user.id);
    }
  }

  if (idsToDelete.size === 0) {
    return 0;
  }

  const result = await prisma.user.updateMany({
    where: {
      id: { in: [...idsToDelete] },
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Audita usuarios activos con email duplicado (exacto o identidad canónica).
 *
 * Uso:
 *   npm run audit:duplicate-emails
 *   npm run audit:duplicate-emails -- --json
 *   npm run audit:duplicate-emails -- --exact-only
 *   npm run audit:duplicate-emails -- --apply
 */
async function main() {
  const { apply, json, includeCanonical } = parseArgs();
  const { prisma, pool } = createPrismaClient();

  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        restaurantId: true,
        isActive: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const exactGroups = groupExactDuplicates(users);
    const canonicalGroups = includeCanonical
      ? groupCanonicalDuplicates(users)
      : [];

    const mergedGroups = [...exactGroups];
    const exactKeys = new Set(exactGroups.map((group) => group.key));

    for (const group of canonicalGroups) {
      if (exactKeys.has(group.key)) continue;
      mergedGroups.push(group);
    }

    const duplicateUserCount = mergedGroups.reduce(
      (total, group) => total + group.users.length,
      0,
    );
    const removableCount = mergedGroups.reduce(
      (total, group) => total + Math.max(group.users.length - 1, 0),
      0,
    );

    if (json) {
      console.log(
        JSON.stringify(
          {
            scannedActiveUsers: users.length,
            duplicateGroups: mergedGroups.length,
            duplicateUsers: duplicateUserCount,
            removableUsers: removableCount,
            exactDuplicateGroups: exactGroups.length,
            canonicalDuplicateGroups: canonicalGroups.length,
            apply,
            groups: mergedGroups.map((group) => ({
              kind: group.kind,
              key: group.key,
              keepUserId: group.users[0]?.id ?? null,
              userIds: group.users.map((user) => user.id),
              users: group.users,
            })),
          },
          null,
          2,
        ),
      );
    } else {
      console.log('Auditoría de emails duplicados (usuarios activos)\n');
      console.log(`Usuarios activos escaneados: ${users.length}`);
      console.log(`Grupos duplicados exactos: ${exactGroups.length}`);
      if (includeCanonical) {
        console.log(
          `Grupos duplicados por identidad canónica: ${canonicalGroups.length}`,
        );
      }
      console.log(`Usuarios en grupos duplicados: ${duplicateUserCount}`);
      console.log(`Usuarios removibles (soft-delete): ${removableCount}`);
      console.log(`Modo: ${apply ? 'APLICAR soft-delete' : 'SOLO REPORTE'}\n`);
      printReport(mergedGroups);
    }

    if (apply) {
      if (mergedGroups.length === 0) {
        if (!json) {
          console.log('Nada para aplicar.');
        }
        return;
      }

      const deletedCount = await applySoftDelete(prisma, mergedGroups);
      if (!json) {
        console.log(`Soft-delete aplicado a ${deletedCount} usuario(s).`);
        console.log(
          'Próximo paso: npx prisma migrate deploy (índice único parcial).',
        );
      }
    } else if (!json && mergedGroups.length > 0) {
      console.log(
        'Para aplicar soft-delete manual antes de la migración: npm run audit:duplicate-emails -- --apply',
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Error en auditoría de emails duplicados:', error);
  process.exit(1);
});
