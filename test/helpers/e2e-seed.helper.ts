import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../../src/prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { migrateRestaurantSystemRoles } = require('../../dist/common/utils/migrate-system-roles.util') as typeof import('../../src/common/utils/migrate-system-roles.util');
import type { TenancyTestUser } from './tenancy.helper';
import request from 'supertest';
import type { App } from 'supertest/types';
import { resolveEqualSplitItemIdsForStep } from './salon-equal-split-allocator';

export const E2E_FIXTURE_PASSWORD = 'E2eTestPass123!';

export interface E2EGoldenFixture {
  suffix: string;
  tenantA: TenancyTestUser & {
    email: string;
    tableId: string;
    dishId: string;
    inventoryItemId: string;
    slug: string;
  };
  tenantB: TenancyTestUser & { email: string; slug: string };
  superAdmin: TenancyTestUser & { email: string };
  cleanup: () => Promise<void>;
}

interface GoldenSeedCore {
  suffix: string;
  tenantA: {
    email: string;
    restaurantId: string;
    userId: string;
    slug: string;
    roleId: string;
    tableId: string;
    dishId: string;
    inventoryItemId: string;
  };
  tenantB: {
    email: string;
    restaurantId: string;
    userId: string;
    slug: string;
    roleId: string;
  };
  superAdmin: {
    email: string;
    userId: string;
  };
  cleanup: () => Promise<void>;
}

/** Stock inicial y consumo por unidad vendida del plato fixture (BOM). */
export const E2E_INVENTORY_INITIAL_STOCK = 10;
export const E2E_INVENTORY_RECIPE_QTY_PER_DISH = 2;

export const GOLDEN_FLOWS_ENABLED = process.env.E2E_GOLDEN_FLOWS === 'true';

const E2E_SUBSCRIPTION_PLANS = [
  {
    id: 'STARTER',
    displayName: 'Directo E2E',
    description: 'Plan fixture para golden flows',
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
    displayName: 'Operación E2E',
    description: 'Plan fixture upgrade',
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

export async function ensureE2ESubscriptionPlans(
  prisma: PrismaService,
): Promise<void> {
  for (const plan of E2E_SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      create: plan,
      update: {
        displayName: plan.displayName,
        description: plan.description,
        price: plan.price,
        interval: plan.interval,
        trialDays: plan.trialDays,
        color: plan.color,
        order: plan.order,
        isActive: plan.isActive,
        isDefault: plan.isDefault,
        showOnLanding: plan.showOnLanding,
        isPopular: plan.isPopular,
      },
    });
  }
}

export interface SalonCashCloseResult {
  sessionId: string;
  orderId: string;
}

export interface SalonEqualSplitCloseResult {
  sessionId: string;
  orderIds: string[];
}

type SalonFloorTenant = {
  token: string;
  restaurantId: string;
  tableId: string;
  dishId: string;
};

async function ensureSalonCashOpen(
  httpServer: App,
  tenant: SalonFloorTenant,
): Promise<void> {
  const base = `/api/restaurants/${tenant.restaurantId}/floor`;
  const openCashRes = await request(httpServer)
    .post(`${base}/cash-register/open`)
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({ openingFloat: 10000 });

  expect([200, 201, 400]).toContain(openCashRes.status);
  if (openCashRes.status === 400) {
    expect(String(openCashRes.body?.message ?? '')).toMatch(/caja/i);
  }
}

async function fetchUnpaidSessionItems(
  httpServer: App,
  tenant: SalonFloorTenant,
  sessionId: string,
): Promise<Array<{ id: string; subtotal: number; paidInOrderId: string | null }>> {
  const base = `/api/restaurants/${tenant.restaurantId}/floor`;
  const sessionRes = await request(httpServer)
    .get(`${base}/sessions/${sessionId}`)
    .set('Authorization', `Bearer ${tenant.token}`)
    .expect(200);

  const items = sessionRes.body.session?.items as Array<{
    id: string;
    subtotal: number;
    paidInOrderId?: string | null;
    kitchenStatus?: string;
  }>;

  return (items ?? [])
    .filter(
      (item) =>
        !item.paidInOrderId && item.kitchenStatus !== 'CANCELLED',
    )
    .map((item) => ({
      id: item.id,
      subtotal: item.subtotal,
      paidInOrderId: item.paidInOrderId ?? null,
    }));
}

export async function runSalonCashCloseFlow(
  httpServer: App,
  tenant: SalonFloorTenant,
): Promise<SalonCashCloseResult> {
  const base = `/api/restaurants/${tenant.restaurantId}/floor`;

  await ensureSalonCashOpen(httpServer, tenant);

  const openSession = await request(httpServer)
    .post(`${base}/sessions`)
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({ tableId: tenant.tableId, guestCount: 2 })
    .expect((res) => {
      expect([200, 201]).toContain(res.status);
    });

  const sessionId = openSession.body.session.id as string;

  await request(httpServer)
    .post(`${base}/sessions/${sessionId}/items`)
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({
      items: [
        {
          dishId: tenant.dishId,
          quantity: 1,
          sendToKitchen: true,
        },
      ],
    })
    .expect((res) => {
      expect([200, 201]).toContain(res.status);
    });

  const closeRes = await request(httpServer)
    .post(`${base}/sessions/${sessionId}/close`)
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({ paymentMethod: 'cash' })
    .expect((res) => {
      expect([200, 201]).toContain(res.status);
    });

  const orderId =
    (closeRes.body.order?.id as string | undefined) ??
    (closeRes.body.orderId as string | undefined);
  if (!orderId) {
    throw new Error(
      `Salon close did not return order id: ${JSON.stringify(closeRes.body)}`,
    );
  }

  return { sessionId, orderId };
}

/** Cobro en N partes iguales (split equitativo) — mesa abierta hasta el último pago. */
export async function runSalonEqualSplitCloseFlow(
  httpServer: App,
  tenant: SalonFloorTenant,
  parts = 2,
  lineItemCount = 3,
): Promise<SalonEqualSplitCloseResult> {
  const base = `/api/restaurants/${tenant.restaurantId}/floor`;

  await ensureSalonCashOpen(httpServer, tenant);

  const openSession = await request(httpServer)
    .post(`${base}/sessions`)
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({ tableId: tenant.tableId, guestCount: parts })
    .expect((res) => {
      expect([200, 201]).toContain(res.status);
    });

  const sessionId = openSession.body.session.id as string;

  for (let index = 0; index < lineItemCount; index += 1) {
    await request(httpServer)
      .post(`${base}/sessions/${sessionId}/items`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        items: [
          {
            dishId: tenant.dishId,
            quantity: 1,
            sendToKitchen: true,
          },
        ],
      })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
  }

  const orderIds: string[] = [];

  for (let step = 1; step <= parts; step += 1) {
    const unpaid = await fetchUnpaidSessionItems(httpServer, tenant, sessionId);
    expect(unpaid.length).toBeGreaterThan(0);

    const itemIds = resolveEqualSplitItemIdsForStep(unpaid, parts, step);
    expect(itemIds.length).toBeGreaterThan(0);

    const previewRes = await request(httpServer)
      .get(`${base}/sessions/${sessionId}/close-preview`)
      .query({
        paymentMethod: 'cash',
        itemIds: itemIds.join(','),
      })
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    const isLast = step === parts;
    expect(previewRes.body.partial).toBe(!isLast);
    expect(previewRes.body.total).toBeGreaterThan(0);

    const closeRes = await request(httpServer)
      .post(`${base}/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ paymentMethod: 'cash', itemIds })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    const orderId =
      (closeRes.body.order?.id as string | undefined) ??
      (closeRes.body.orderId as string | undefined);
    if (!orderId) {
      throw new Error(
        `Partial salon close step ${step} missing order id: ${JSON.stringify(closeRes.body)}`,
      );
    }
    orderIds.push(orderId);

    expect(closeRes.body.partial).toBe(!isLast);
    expect(closeRes.body.session.status).toBe(isLast ? 'CLOSED' : 'OPEN');
    expect(closeRes.body.remainingItemCount).toBe(isLast ? 0 : unpaid.length - itemIds.length);
  }

  const paidRows = await fetchUnpaidSessionItems(httpServer, tenant, sessionId);
  expect(paidRows).toHaveLength(0);

  return { sessionId, orderIds };
}

export async function waitForOrderInventoryDeduction(
  prisma: PrismaService,
  orderId: string,
  maxAttempts = 30,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const row = await prisma.orderInventoryDeduction.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (row) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Inventory deduction not recorded for order ${orderId} after ${maxAttempts} attempts`,
  );
}

function restaurantPayload(slug: string, name: string) {
  return {
    slug,
    name,
    type: 'restaurant',
    cuisineTypes: ['argentina'],
    email: `${slug}@e2e.bentoo.test`,
    phone: '1100000000',
    address: 'Calle E2E 123',
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
      inventory: {
        autoDeductOnSale: true,
      },
    },
  };
}

async function createTenant(
  prisma: PrismaService,
  slug: string,
  label: 'a' | 'b',
) {
  const restaurant = await prisma.restaurant.create({
    data: restaurantPayload(slug, `E2E Tenant ${label.toUpperCase()}`),
  });

  await migrateRestaurantSystemRoles(prisma, restaurant.id);

  const ownerRole = await prisma.role.findFirstOrThrow({
    where: { restaurantId: restaurant.id, name: 'OWNER' },
    select: { id: true },
  });

  const passwordHash = await bcrypt.hash(E2E_FIXTURE_PASSWORD, 10);
  const email = `owner-${label}-${slug}@e2e.bentoo.test`;

  const user = await prisma.user.create({
    data: {
      email,
      name: `Owner ${label.toUpperCase()}`,
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

  return {
    email,
    restaurantId: restaurant.id,
    userId: user.id,
    slug: restaurant.slug,
    roleId: ownerRole.id,
  };
}

async function ensureSuperAdminRole(prisma: PrismaService) {
  let role = await prisma.role.findFirst({
    where: { name: 'SUPER_ADMIN', restaurantId: null },
  });

  if (!role) {
    role = await prisma.role.create({
      data: {
        name: 'SUPER_ADMIN',
        permissions: ['all', 'super_admin'],
        color: '#ef4444',
        isSystemRole: true,
      },
    });
  }

  return role;
}

async function createSuperAdminUser(prisma: PrismaService, suffix: string) {
  const role = await ensureSuperAdminRole(prisma);
  const passwordHash = await bcrypt.hash(E2E_FIXTURE_PASSWORD, 10);
  const email = `super-admin-${suffix}@e2e.bentoo.test`;

  const user = await prisma.user.create({
    data: {
      email,
      name: 'E2E Super Admin',
      password: passwordHash,
      roleId: role.id,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  return { email, userId: user.id };
}

async function loginE2eToken(
  httpServer: App,
  email: string,
): Promise<string> {
  const response = await request(httpServer)
    .post('/api/auth/login')
    .send({ email, password: E2E_FIXTURE_PASSWORD });

  if (![200, 201].includes(response.status) || !response.body?.token) {
    throw new Error(
      `E2E login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return response.body.token as string;
}

export async function isGoldenFlowDatabaseReady(
  prisma: PrismaService,
): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "OperationalOutbox" LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function seedGoldenFlowFixture(
  prisma: PrismaService,
): Promise<GoldenSeedCore> {
  await ensureE2ESubscriptionPlans(prisma);

  const suffix = `${Date.now()}`;
  const slugA = `e2e-a-${suffix}`;
  const slugB = `e2e-b-${suffix}`;

  const tenantA = await createTenant(prisma, slugA, 'a');
  const tenantB = await createTenant(prisma, slugB, 'b');

  const category = await prisma.category.create({
    data: {
      restaurantId: tenantA.restaurantId,
      name: 'E2E Platos',
      description: 'Fixture category',
    },
  });

  const dish = await prisma.dish.create({
    data: {
      restaurantId: tenantA.restaurantId,
      categoryId: category.id,
      name: 'Milanesa E2E',
      price: 5000,
      salonPrice: 5000,
      isAvailable: true,
      isAvailableInSalon: true,
    },
  });

  const table = await prisma.table.create({
    data: {
      restaurantId: tenantA.restaurantId,
      number: '1',
      capacity: 4,
    },
  });

  const inventoryItem = await prisma.inventoryItem.create({
    data: {
      restaurantId: tenantA.restaurantId,
      name: 'Carne E2E',
      unit: 'kg',
      currentStock: E2E_INVENTORY_INITIAL_STOCK,
      minStock: 1,
      linkedDishIds: [dish.id],
    },
  });

  await prisma.dishRecipeLine.create({
    data: {
      dishId: dish.id,
      inventoryItemId: inventoryItem.id,
      quantity: E2E_INVENTORY_RECIPE_QTY_PER_DISH,
    },
  });

  const superAdmin = await createSuperAdminUser(prisma, suffix);
  const restaurantIds = [tenantA.restaurantId, tenantB.restaurantId];

  return {
    suffix,
    tenantA: {
      ...tenantA,
      tableId: table.id,
      dishId: dish.id,
      inventoryItemId: inventoryItem.id,
    },
    tenantB,
    superAdmin,
    cleanup: async () => {
      try {
        await prisma.operationalOutbox.deleteMany({
          where: { restaurantId: { in: restaurantIds } },
        });
      } catch {
        // Tabla ausente si no corrió migrate deploy
      }
      await prisma.tableSession.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.fiscalDocument.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.restaurantTerminal.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.operationalEpisode.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.coordination.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.operationShift.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.order.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.orderInventoryDeduction.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.dishRecipeLine.deleteMany({
        where: { dishId: dish.id },
      });
      await prisma.inventoryItem.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.restaurantMembership.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.user.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.dish.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.category.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.table.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.role.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.restaurant.deleteMany({
        where: { id: { in: restaurantIds } },
      });
      await prisma.user.deleteMany({
        where: { id: superAdmin.userId },
      });
    },
  };
}

export async function hydrateGoldenFlowTokens(
  httpServer: App,
  seed: GoldenSeedCore,
): Promise<E2EGoldenFixture> {
  const [tokenA, tokenB, superAdminToken] = await Promise.all([
    loginE2eToken(httpServer, seed.tenantA.email),
    loginE2eToken(httpServer, seed.tenantB.email),
    loginE2eToken(httpServer, seed.superAdmin.email),
  ]);

  return {
    suffix: seed.suffix,
    tenantA: {
      token: tokenA,
      restaurantId: seed.tenantA.restaurantId,
      userId: seed.tenantA.userId,
      email: seed.tenantA.email,
      slug: seed.tenantA.slug,
      tableId: seed.tenantA.tableId,
      dishId: seed.tenantA.dishId,
      inventoryItemId: seed.tenantA.inventoryItemId,
    },
    tenantB: {
      token: tokenB,
      restaurantId: seed.tenantB.restaurantId,
      userId: seed.tenantB.userId,
      email: seed.tenantB.email,
      slug: seed.tenantB.slug,
    },
    superAdmin: {
      token: superAdminToken,
      userId: seed.superAdmin.userId,
      email: seed.superAdmin.email,
    },
    cleanup: seed.cleanup,
  };
}
