import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RolesCatalogService } from '../common/services/roles-catalog.service';
import { PlanType } from './dto';

type SubscriptionSelect = Prisma.SubscriptionSelect;
type SubscriptionInclude = Prisma.SubscriptionInclude;

/**
 * Resuelve la suscripción efectiva para un restaurante o usuario.
 *
 * Modelo: la cuenta del OWNER paga una sola vez; los locales heredan el plan.
 * Durante la migración, si no hay userId, se usa la fila por restaurantId (legacy).
 */
@Injectable()
export class SubscriptionResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesCatalog: RolesCatalogService,
  ) {}

  async getBillingUserIdForRestaurant(
    restaurantId: string,
  ): Promise<string | null> {
    try {
      const ownerRoleId = await this.rolesCatalog.getOwnerRoleId(restaurantId);

      const ownerMembership = await this.prisma.restaurantMembership.findFirst({
        where: { restaurantId, roleId: ownerRoleId },
        select: { userId: true },
        orderBy: { createdAt: 'asc' },
      });
      if (ownerMembership) return ownerMembership.userId;

      const ownerUser = await this.prisma.user.findFirst({
        where: { restaurantId, roleId: ownerRoleId },
        select: { id: true },
      });
      if (ownerUser) return ownerUser.id;
    } catch {
      // Rol OWNER aún no provisionado
    }

    const fallbackMembership = await this.prisma.restaurantMembership.findFirst(
      {
        where: { restaurantId },
        select: { userId: true },
        orderBy: { createdAt: 'asc' },
      },
    );
    return fallbackMembership?.userId ?? null;
  }

  async resolveForRestaurant<T extends SubscriptionSelect | undefined>(
    restaurantId: string,
    args?: { select?: T; include?: SubscriptionInclude },
  ) {
    const billingUserId =
      await this.getBillingUserIdForRestaurant(restaurantId);

    if (billingUserId) {
      const accountSub = await this.prisma.subscription.findFirst({
        where: {
          userId: billingUserId,
          isBillingAnchor: true,
        },
        ...(args?.select ? { select: args.select } : {}),
        ...(args?.include ? { include: args.include } : {}),
      });
      if (accountSub) return accountSub;

      const anyUserSub = await this.prisma.subscription.findFirst({
        where: { userId: billingUserId },
        ...(args?.select ? { select: args.select } : {}),
        ...(args?.include ? { include: args.include } : {}),
      });
      if (anyUserSub) return anyUserSub;
    }

    return this.prisma.subscription.findUnique({
      where: { restaurantId },
      ...(args?.select ? { select: args.select } : {}),
      ...(args?.include ? { include: args.include } : {}),
    });
  }

  async resolveForUser<T extends SubscriptionSelect | undefined>(
    userId: string,
    args?: { select?: T; include?: SubscriptionInclude },
  ) {
    const accountSub = await this.prisma.subscription.findFirst({
      where: { userId, isBillingAnchor: true },
      ...(args?.select ? { select: args.select } : {}),
      ...(args?.include ? { include: args.include } : {}),
    });
    if (accountSub) return accountSub;

    const anyUserSub = await this.prisma.subscription.findFirst({
      where: { userId },
      ...(args?.select ? { select: args.select } : {}),
      ...(args?.include ? { include: args.include } : {}),
    });
    if (anyUserSub) return anyUserSub;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });
    if (!user?.restaurantId) return null;

    return this.resolveForRestaurant(user.restaurantId, args);
  }

  async resolvePlanIdForRestaurant(restaurantId: string): Promise<string> {
    const subscription = await this.resolveForRestaurant(restaurantId, {
      select: { planId: true, planType: true },
    });
    if (!subscription) return PlanType.STARTER;
    return (
      subscription.planId ||
      (subscription.planType as string) ||
      PlanType.STARTER
    );
  }

  async countOwnedRestaurants(userId: string): Promise<number> {
    const memberships = await this.prisma.restaurantMembership.findMany({
      where: { userId },
      include: { role: { select: { name: true } } },
    });

    const ownedFromMemberships = memberships.filter(
      (membership) => membership.role?.name === 'OWNER',
    ).length;

    if (ownedFromMemberships > 0) return ownedFromMemberships;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true, role: { select: { name: true } } },
    });
    if (user?.restaurantId && user.role?.name === 'OWNER') return 1;

    return 0;
  }

  async userHasAccountSubscription(userId: string): Promise<boolean> {
    const existing = await this.prisma.subscription.findFirst({
      where: { userId, isBillingAnchor: true },
      select: { id: true },
    });
    return !!existing;
  }
}
