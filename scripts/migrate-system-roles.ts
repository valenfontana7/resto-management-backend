import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { migrateRestaurantSystemRoles } from '../src/common/utils/migrate-system-roles.util';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está configurada. Definila en .env antes de migrar.',
    );
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

const { prisma, pool } = createPrismaClient();

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const restaurantArg = process.argv.find((arg) =>
    arg.startsWith('--restaurant-id='),
  );
  const restaurantId = restaurantArg?.split('=')[1]?.trim() || undefined;
  return { dryRun, restaurantId };
}

/**
 * Migra roles legacy (Admin, Manager, …) al catálogo canónico (OWNER, MANAGER, …).
 *
 * Uso:
 *   npm run migrate:roles
 *   npm run migrate:roles -- --dry-run
 *   npm run migrate:roles -- --restaurant-id=clxxx
 */
async function main() {
  const { dryRun, restaurantId } = parseArgs();

  console.log('Migración de roles de sistema → catálogo canónico\n');
  console.log(`Modo: ${dryRun ? 'DRY RUN (sin escritura)' : 'APLICAR CAMBIOS'}`);
  if (restaurantId) {
    console.log(`Restaurante: ${restaurantId}`);
  } else {
    console.log('Alcance: todos los restaurantes');
  }
  console.log('');

  const restaurants = await prisma.restaurant.findMany({
    where: restaurantId ? { id: restaurantId } : undefined,
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });

  if (restaurants.length === 0) {
    console.log('No se encontraron restaurantes para migrar.');
    return;
  }

  console.log(`Restaurantes a procesar: ${restaurants.length}\n`);

  let processed = 0;
  let withChanges = 0;
  let errors = 0;
  const totals = {
    rolesUpdated: 0,
    rolesCreated: 0,
    rolesMerged: 0,
    usersReassigned: 0,
    membershipsReassigned: 0,
  };

  for (const restaurant of restaurants) {
    try {
      const stats = await prisma.$transaction((tx) =>
        migrateRestaurantSystemRoles(tx, restaurant.id, { dryRun }),
      );

      processed++;
      totals.rolesUpdated += stats.rolesUpdated;
      totals.rolesCreated += stats.rolesCreated;
      totals.rolesMerged += stats.rolesMerged;
      totals.usersReassigned += stats.usersReassigned;
      totals.membershipsReassigned += stats.membershipsReassigned;

      const changed =
        stats.rolesUpdated +
          stats.rolesCreated +
          stats.rolesMerged +
          stats.usersReassigned +
          stats.membershipsReassigned >
        0;

      if (changed) {
        withChanges++;
        console.log(
          `[${dryRun ? 'simulado' : 'ok'}] ${restaurant.name} (${restaurant.slug})` +
            ` · +${stats.rolesCreated} creados` +
            ` · ${stats.rolesUpdated} actualizados` +
            ` · ${stats.rolesMerged} fusionados` +
            ` · ${stats.usersReassigned} usuarios reasignados`,
        );
      } else {
        console.log(`[sin cambios] ${restaurant.name} (${restaurant.slug})`);
      }
    } catch (error) {
      errors++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${restaurant.name} (${restaurant.slug}): ${message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESUMEN');
  console.log('='.repeat(60));
  console.log(`Restaurantes procesados:     ${processed}`);
  console.log(`Con cambios:                 ${withChanges}`);
  console.log(`Roles creados:               ${totals.rolesCreated}`);
  console.log(`Roles actualizados:          ${totals.rolesUpdated}`);
  console.log(`Roles fusionados:            ${totals.rolesMerged}`);
  console.log(`Usuarios reasignados:        ${totals.usersReassigned}`);
  console.log(`Memberships reasignados:     ${totals.membershipsReassigned}`);
  console.log(`Errores:                     ${errors}`);
  console.log('='.repeat(60));

  if (dryRun && withChanges > 0) {
    console.log('\nEjecutá sin --dry-run para aplicar los cambios.');
  }

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('\nScript falló:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
