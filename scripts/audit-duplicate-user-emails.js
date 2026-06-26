require('dotenv/config');
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

function parseArgs() {
  const apply = process.argv.includes('--apply');
  const json = process.argv.includes('--json');
  const includeCanonical = !process.argv.includes('--exact-only');
  const includeDeleted = process.argv.includes('--include-deleted');
  return { apply, json, includeCanonical, includeDeleted };
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
    const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function mergeDuplicateGroups(exactGroups, canonicalGroups) {
  const mergedGroups = [...exactGroups];
  const exactKeys = new Set(exactGroups.map((group) => group.key));

  for (const group of canonicalGroups) {
    if (exactKeys.has(group.key)) continue;
    mergedGroups.push(group);
  }

  return mergedGroups;
}

function formatUser(user) {
  const restaurant = user.restaurantId ?? 'sin-restaurante';
  const status = user.isActive ? 'activo' : 'inactivo';
  const deleted = user.deletedAt
    ? `soft-deleted (${new Date(user.deletedAt).toISOString()})`
    : 'activo-en-db';
  return [
    `  - ${user.id}`,
    `    email: ${user.email}`,
    `    nombre: ${user.name}`,
    `    creado: ${new Date(user.createdAt).toISOString()}`,
    `    restaurante: ${restaurant}`,
    `    estado: ${status}`,
    `    registro: ${deleted}`,
  ].join('\n');
}

function printReport(title, groups) {
  console.log(title);
  if (groups.length === 0) {
    console.log('  Ninguno.\n');
    return;
  }

  console.log(`  Grupos: ${groups.length}\n`);
  for (const group of groups) {
    const keep = group.users[0];
    const remove = group.users.slice(1);
    const label =
      group.kind === 'exact'
        ? `Email exacto: ${group.key}`
        : `Identidad canónica: ${group.key}`;

    console.log(`  ${label}`);
    console.log(`    Conservar: ${keep.id} (${keep.email})`);
    console.log(`    Removibles: ${remove.length}`);
    for (const user of group.users) {
      console.log(formatUser(user));
    }
    console.log('');
  }
}

async function fetchUsers(pool, includeDeleted) {
  const whereClause = includeDeleted ? '' : 'WHERE "deletedAt" IS NULL';
  const { rows } = await pool.query(`
    SELECT
      id,
      email,
      name,
      "createdAt",
      "restaurantId",
      "isActive",
      "deletedAt"
    FROM "User"
    ${whereClause}
    ORDER BY "createdAt" ASC, id ASC
  `);
  return rows;
}

async function applySoftDelete(pool, groups) {
  const idsToDelete = new Set();

  for (const group of groups) {
    for (const user of group.users.slice(1)) {
      if (!user.deletedAt) {
        idsToDelete.add(user.id);
      }
    }
  }

  if (idsToDelete.size === 0) {
    return 0;
  }

  const { rowCount } = await pool.query(
    `
      UPDATE "User"
      SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ANY($1::text[]) AND "deletedAt" IS NULL
    `,
    [[...idsToDelete]],
  );

  return rowCount ?? 0;
}

/**
 * Audita usuarios con email duplicado (exacto o identidad canónica).
 *
 * Uso:
 *   npm run audit:duplicate-emails
 *   npm run audit:duplicate-emails -- --json
 *   npm run audit:duplicate-emails -- --exact-only
 *   npm run audit:duplicate-emails -- --include-deleted
 *   npm run audit:duplicate-emails -- --apply
 */
async function main() {
  const { apply, json, includeCanonical, includeDeleted } = parseArgs();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL?.trim() });

  try {
    const activeUsers = await fetchUsers(pool, false);
    const allUsers = includeDeleted ? await fetchUsers(pool, true) : activeUsers;
    const softDeletedUsers = allUsers.filter((user) => user.deletedAt);

    const activeExactGroups = groupExactDuplicates(activeUsers);
    const activeCanonicalGroups = includeCanonical
      ? groupCanonicalDuplicates(activeUsers)
      : [];
    const activeGroups = mergeDuplicateGroups(
      activeExactGroups,
      activeCanonicalGroups,
    );

    const deletedExactGroups = includeDeleted
      ? groupExactDuplicates(allUsers)
      : [];
    const deletedCanonicalGroups =
      includeDeleted && includeCanonical
        ? groupCanonicalDuplicates(allUsers)
        : [];
    const allGroups = includeDeleted
      ? mergeDuplicateGroups(deletedExactGroups, deletedCanonicalGroups)
      : [];

    const removableCount = activeGroups.reduce(
      (total, group) => total + Math.max(group.users.length - 1, 0),
      0,
    );

    if (json) {
      console.log(
        JSON.stringify(
          {
            scannedActiveUsers: activeUsers.length,
            scannedAllUsers: allUsers.length,
            softDeletedUsers: softDeletedUsers.length,
            activeDuplicateGroups: activeGroups.length,
            allDuplicateGroups: allGroups.length,
            removableActiveUsers: removableCount,
            apply,
            activeGroups,
            allGroups: includeDeleted ? allGroups : undefined,
          },
          null,
          2,
        ),
      );
    } else {
      console.log('Auditoría de emails duplicados\n');
      console.log(`Usuarios activos (deletedAt IS NULL): ${activeUsers.length}`);
      if (includeDeleted) {
        console.log(`Usuarios totales en DB: ${allUsers.length}`);
        console.log(`Usuarios soft-deleted: ${softDeletedUsers.length}`);
      }
      console.log(`Modo: ${apply ? 'APLICAR soft-delete' : 'SOLO REPORTE'}\n`);

      printReport('Duplicados entre usuarios ACTIVOS:', activeGroups);

      if (includeDeleted) {
        printReport(
          'Duplicados incluyendo soft-deleted (lo que veía /master/users antes del fix):',
          allGroups,
        );
      } else if (softDeletedUsers.length > 0) {
        console.log(
          `Hay ${softDeletedUsers.length} usuario(s) soft-deleted que ya no cuentan como activos.`,
        );
        console.log(
          'Para verlos en el reporte: npm run audit:duplicate-emails -- --include-deleted\n',
        );
      }
    }

    if (apply) {
      if (activeGroups.length === 0) {
        if (!json) {
          console.log('Nada para aplicar entre usuarios activos.');
        }
        return;
      }

      const deletedCount = await applySoftDelete(pool, activeGroups);
      if (!json) {
        console.log(`Soft-delete aplicado a ${deletedCount} usuario(s) activo(s).`);
        console.log(
          'Próximo paso: npx prisma migrate deploy (índice único parcial).',
        );
      }
    } else if (!json && activeGroups.length > 0) {
      console.log(
        'Para aplicar soft-delete: npm run audit:duplicate-emails -- --apply',
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Error en auditoría de emails duplicados:', error);
  process.exit(1);
});
