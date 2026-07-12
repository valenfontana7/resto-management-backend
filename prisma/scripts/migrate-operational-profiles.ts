/**
 * Migra restaurantes existentes a RestaurantOperationalProfile.
 *
 * Uso (dev):
 *   npm run migrate:operational-profiles -- --dry-run
 *
 * Uso (producción / Docker — requiere `dist/` del build):
 *   docker compose exec app npm run migrate:operational-profiles:prod -- --dry-run
 *   docker compose exec app npm run migrate:operational-profiles:prod
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const requireModule = createRequire(__filename);

type InferProfileFromLegacyFn = (snapshot: {
  id: string;
  businessRules: unknown;
  features: unknown;
  onboardingIncomplete: boolean;
  createdAt: Date;
  _count?: { orders?: number; tableSessions?: number };
}) => {
  schemaVersion: number;
  operationalModel: string;
  maturityLevel: string;
  focusAreas: string[];
  businessPriorities: Record<string, unknown>;
  capabilitySnapshot: Record<string, unknown> | null;
  profileStatus: string;
  completedWizardVersion: number | null;
  completedStepIds: string[];
  completedAt: Date | null;
  completedByUserId: string | null;
  migratedFromLegacy: boolean;
  migrationSource: string | null;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes('--dry-run');

function loadInferProfileFromLegacy(): InferProfileFromLegacyFn {
  const distPath = join(
    __dirname,
    '../../dist/operational-profile/operational-profile-inference.js',
  );
  const srcPath = join(
    __dirname,
    '../../src/operational-profile/operational-profile-inference.ts',
  );

  if (existsSync(distPath)) {
    const mod = requireModule(distPath) as {
      inferProfileFromLegacy: InferProfileFromLegacyFn;
    };
    return mod.inferProfileFromLegacy;
  }

  if (existsSync(srcPath)) {
    const mod = requireModule(srcPath) as {
      inferProfileFromLegacy: InferProfileFromLegacyFn;
    };
    return mod.inferProfileFromLegacy;
  }

  throw new Error(
    'No se encontró el módulo de inferencia. En producción ejecutá `npm run build` antes de migrar.',
  );
}

async function main() {
  const inferProfileFromLegacy = loadInferProfileFromLegacy();

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
        businessPriorities:
          inferred.businessPriorities as unknown as Prisma.InputJsonValue,
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
