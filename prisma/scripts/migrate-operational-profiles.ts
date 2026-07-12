/**
 * Migra restaurantes existentes a RestaurantOperationalProfile.
 *
 * Uso:
 *   npx ts-node prisma/scripts/migrate-operational-profiles.ts
 *   npx ts-node prisma/scripts/migrate-operational-profiles.ts --dry-run
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { inferProfileFromLegacy } from '../../src/operational-profile/operational-profile-inference';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes('--dry-run');

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
        businessPriorities: inferred.businessPriorities as unknown as Prisma.InputJsonValue,
        capabilitySnapshot: (inferred.capabilitySnapshot ??
          Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
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
