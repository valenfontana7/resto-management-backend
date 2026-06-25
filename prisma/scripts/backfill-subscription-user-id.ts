/**
 * Backfill: vincula Subscription.userId al OWNER y consolida cobros duplicados.
 *
 * Uso: npx ts-node prisma/scripts/backfill-subscription-user-id.ts
 */
import 'dotenv/config';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PLAN_RANK: Record<string, number> = {
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

function planScore(planId: string, status: SubscriptionStatus): number {
  const rank = PLAN_RANK[planId] ?? 0;
  const statusScore =
    status === SubscriptionStatus.ACTIVE
      ? 30
      : status === SubscriptionStatus.TRIALING
        ? 20
        : status === SubscriptionStatus.PAST_DUE
          ? 10
          : 0;
  return rank * 10 + statusScore;
}

async function resolveOwnerUserId(
  restaurantId: string,
  ownerRoleId: string,
): Promise<string | null> {
  const membership = await prisma.restaurantMembership.findFirst({
    where: { restaurantId, roleId: ownerRoleId },
    select: { userId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (membership) return membership.userId;

  const user = await prisma.user.findFirst({
    where: { restaurantId, roleId: ownerRoleId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function main() {
  const subscriptions = await prisma.subscription.findMany({
    select: {
      id: true,
      restaurantId: true,
      userId: true,
      planId: true,
      status: true,
      isBillingAnchor: true,
    },
  });

  const ownerRoleCache = new Map<string, string>();
  const byUser = new Map<string, typeof subscriptions>();

  for (const sub of subscriptions) {
    let ownerRoleId = ownerRoleCache.get(sub.restaurantId);
    if (!ownerRoleId) {
      const role = await prisma.role.findFirst({
        where: { restaurantId: sub.restaurantId, name: 'OWNER' },
        select: { id: true },
      });
      if (!role) continue;
      ownerRoleId = role.id;
      ownerRoleCache.set(sub.restaurantId, ownerRoleId);
    }

    const ownerUserId = await resolveOwnerUserId(sub.restaurantId, ownerRoleId);
    if (!ownerUserId) continue;

    if (!sub.userId) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { userId: ownerUserId },
      });
      sub.userId = ownerUserId;
    }

    const list = byUser.get(ownerUserId) ?? [];
    list.push(sub);
    byUser.set(ownerUserId, list);
  }

  let anchors = 0;
  let mirrors = 0;

  for (const [, userSubs] of byUser) {
    if (userSubs.length <= 1) {
      await prisma.subscription.update({
        where: { id: userSubs[0].id },
        data: { isBillingAnchor: true },
      });
      anchors += 1;
      continue;
    }

    const sorted = [...userSubs].sort(
      (a, b) =>
        planScore(b.planId, b.status) - planScore(a.planId, a.status),
    );
    const winner = sorted[0];

    await prisma.subscription.update({
      where: { id: winner.id },
      data: { isBillingAnchor: true, userId: winner.userId },
    });
    anchors += 1;

    for (const loser of sorted.slice(1)) {
      await prisma.subscription.update({
        where: { id: loser.id },
        data: { isBillingAnchor: false },
      });
      mirrors += 1;
    }
  }

  console.log(
    `Backfill listo: ${subscriptions.length} suscripciones, ${anchors} anclas, ${mirrors} espejos sin cobro.`,
  );
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
