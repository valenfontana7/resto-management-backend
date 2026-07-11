/**
 * Fixture idempotente para smoke Playwright en modo reuse (CI / nightly).
 *
 * Uso:
 *   npm run seed:e2e-smoke-ci
 *
 * Credenciales fijas (solo entornos de test):
 *   E2E_SMOKE_EMAIL=e2e-smoke-ci@bentoo.test
 *   E2E_SMOKE_PASSWORD=E2eSmokeCiPass123!
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  OrderStatus,
  OrderType,
  PaymentStatus,
  PlanType,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { migrateRestaurantSystemRoles } from '../../src/common/utils/migrate-system-roles.util';

export const E2E_SMOKE_CI_EMAIL = 'e2e-smoke-ci@bentoo.test';
export const E2E_SMOKE_CI_PASSWORD = 'E2eSmokeCiPass123!';
const E2E_SMOKE_CI_SLUG = 'e2e-smoke-ci';

const E2E_SUBSCRIPTION_PLANS = [
  {
    id: 'STARTER',
    displayName: 'Directo CI',
    description: 'Plan fixture smoke CI',
    price: 1500000,
    interval: 'monthly',
    trialDays: 14,
    color: 'from-stone-500 to-stone-700',
    order: 1,
    isActive: true,
    isDefault: true,
    showOnLanding: false,
    isPopular: false,
  },
  {
    id: 'PROFESSIONAL',
    displayName: 'Operación CI',
    description: 'Plan fixture smoke CI',
    price: 3500000,
    interval: 'monthly',
    trialDays: 14,
    color: 'from-teal-500 to-emerald-600',
    order: 2,
    isActive: true,
    isDefault: false,
    showOnLanding: false,
    isPopular: false,
  },
] as const;

async function ensureSubscriptionPlans(prisma: PrismaClient) {
  for (const plan of E2E_SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      create: plan,
      update: {
        displayName: plan.displayName,
        description: plan.description,
        price: plan.price,
        isActive: plan.isActive,
      },
    });
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await ensureSubscriptionPlans(prisma);

    const passwordHash = await bcrypt.hash(E2E_SMOKE_CI_PASSWORD, 10);

    let restaurant = await prisma.restaurant.findFirst({
      where: { slug: E2E_SMOKE_CI_SLUG },
    });

    if (!restaurant) {
      restaurant = await prisma.restaurant.create({
        data: {
          slug: E2E_SMOKE_CI_SLUG,
          name: 'E2E Smoke CI',
          type: 'restaurant',
          cuisineTypes: ['argentina'],
          email: 'smoke-ci@bentoo.test',
          phone: '1100000099',
          address: 'Calle Smoke CI 1',
          city: 'Buenos Aires',
          country: 'Argentina',
          isPublished: true,
          onboardingIncomplete: false,
          features: {
            menu: true,
            orders: true,
            salon: true,
            tables: true,
          },
          businessRules: {
            operations: {
              stations: [{ id: 'main', name: 'Cocina', code: 'main' }],
            },
          },
        },
      });
      await migrateRestaurantSystemRoles(prisma, restaurant.id);
    } else {
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { isPublished: true, onboardingIncomplete: false },
      });
    }

    const ownerRole = await prisma.role.findFirstOrThrow({
      where: { restaurantId: restaurant.id, name: 'OWNER' },
      select: { id: true },
    });

    let user = await prisma.user.findFirst({
      where: { email: E2E_SMOKE_CI_EMAIL, deletedAt: null },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: E2E_SMOKE_CI_EMAIL,
          name: 'Owner Smoke CI',
          password: passwordHash,
          restaurantId: restaurant.id,
          roleId: ownerRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.restaurantMembership.create({
        data: {
          userId: user.id,
          restaurantId: restaurant.id,
          roleId: ownerRole.id,
          isDefault: true,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash, isActive: true },
      });
    }

    let category = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: 'Smoke CI' },
    });
    if (!category) {
      category = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Smoke CI',
          description: 'Fixture smoke',
        },
      });
    }

    let dish = await prisma.dish.findFirst({
      where: { restaurantId: restaurant.id, name: 'Plato Smoke CI' },
    });
    if (!dish) {
      dish = await prisma.dish.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: category.id,
          name: 'Plato Smoke CI',
          price: 3500,
          salonPrice: 3500,
          isAvailable: true,
          isAvailableInSalon: true,
        },
      });
    }

    const existingSubscription = await prisma.subscription.findFirst({
      where: { restaurantId: restaurant.id },
    });
    if (!existingSubscription) {
      await prisma.subscription.create({
        data: {
          restaurantId: restaurant.id,
          userId: user.id,
          planId: 'PROFESSIONAL',
          planType: PlanType.PROFESSIONAL,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    } else if (
      existingSubscription.planId !== 'PROFESSIONAL' ||
      existingSubscription.status !== SubscriptionStatus.ACTIVE
    ) {
      await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          planId: 'PROFESSIONAL',
          planType: PlanType.PROFESSIONAL,
          status: SubscriptionStatus.ACTIVE,
        },
      });
    }

    const paidOrderCount = await prisma.order.count({
      where: {
        restaurantId: restaurant.id,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    if (paidOrderCount === 0) {
      const price = dish.price;
      await prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          customerName: 'Cliente Smoke CI',
          customerPhone: '+549110000099',
          type: OrderType.PICKUP,
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: 'cash',
          subtotal: price,
          total: price,
          orderNumber: `SMOKE-CI-${Date.now()}`,
          paidAt: new Date(),
          items: {
            create: [
              {
                dishId: dish.id,
                quantity: 1,
                unitPrice: price,
                subtotal: price,
              },
            ],
          },
        },
      });
    }

    const payload = {
      email: E2E_SMOKE_CI_EMAIL,
      password: E2E_SMOKE_CI_PASSWORD,
      restaurantId: restaurant.id,
      userId: user.id,
      restaurantSlug: restaurant.slug,
    };

    console.log(JSON.stringify(payload));

    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `smoke_email=${E2E_SMOKE_CI_EMAIL}\n`,
      );
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `smoke_restaurant_id=${restaurant.id}\n`,
      );
      appendFileSync(process.env.GITHUB_OUTPUT, `smoke_user_id=${user.id}\n`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
