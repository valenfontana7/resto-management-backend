/**
 * Runner de producción (solo Node, sin ts-node).
 *
 * Uso:
 *   node prisma/scripts/migrate-operational-profiles.run.js --dry-run
 *   npm run migrate:operational-profiles:prod -- --dry-run
 */
require('dotenv/config');

const { existsSync } = require('fs');
const { join } = require('path');
const { Prisma, PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const dryRun = process.argv.includes('--dry-run');

const inferencePath = join(
  __dirname,
  '../../dist/operational-profile/operational-profile-inference.js',
);

if (!existsSync(inferencePath)) {
  console.error(
    'No se encontró dist/operational-profile/operational-profile-inference.js. Ejecutá `npm run build` antes de migrar.',
  );
  process.exit(1);
}

const { inferProfileFromLegacy } = require(inferencePath);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      name: true,
      businessRules: true,
      features: true,
      onboardingIncomplete: true,
      createdAt: true,
      operationalProfile: { select: { id: true } },
      _count: { select: { orders: true, tableSessions: true } },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const restaurant of restaurants) {
    if (restaurant.operationalProfile) {
      skipped += 1;
      continue;
    }

    const inferred = inferProfileFromLegacy({
      id: restaurant.id,
      businessRules: restaurant.businessRules,
      features: restaurant.features,
      onboardingIncomplete: restaurant.onboardingIncomplete,
      createdAt: restaurant.createdAt,
      _count: restaurant._count,
    });

    if (dryRun) {
      console.log(
        `[dry-run] ${restaurant.name} → ${inferred.operationalModel} / ${inferred.focusAreas.join(', ')}`,
      );
      created += 1;
      continue;
    }

    await prisma.restaurantOperationalProfile.create({
      data: {
        restaurantId: restaurant.id,
        schemaVersion: inferred.schemaVersion,
        operationalModel: inferred.operationalModel,
        maturityLevel: inferred.maturityLevel,
        focusAreas: inferred.focusAreas,
        businessPriorities: inferred.businessPriorities,
        capabilitySnapshot: inferred.capabilitySnapshot ?? Prisma.JsonNull,
        profileStatus: inferred.profileStatus,
        completedWizardVersion: inferred.completedWizardVersion,
        completedStepIds: inferred.completedStepIds,
        completedAt: inferred.completedAt,
        completedByUserId: inferred.completedByUserId,
        migratedFromLegacy: inferred.migratedFromLegacy,
        migrationSource: inferred.migrationSource,
      },
    });

    console.log(`Migrated: ${restaurant.name} (${inferred.operationalModel})`);
    created += 1;
  }

  console.log(`Done. created=${created} skipped=${skipped} dryRun=${dryRun}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
