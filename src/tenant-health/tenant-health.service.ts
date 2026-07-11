import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeTenantHealthScore,
  emptyBandCounts,
  resolveHealthBand,
  resolveHealthPlaybook,
} from './tenant-health-scoring';
import type {
  TenantHealth360Response,
  TenantHealthBand,
  TenantHealthScore,
} from './tenant-health.types';

type RestaurantHealthRow = {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  paymentProviders: { id: string }[];
  subscription: { status: string } | null;
  orders: { id: string; createdAt: Date }[];
  users: { id: string }[];
  _count: { orders: number };
};

@Injectable()
export class TenantHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth360(options?: {
    limit?: number;
    band?: TenantHealthBand;
    sort?: 'score_asc' | 'score_desc';
  }): Promise<TenantHealth360Response> {
    const limit = options?.limit ?? 100;
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const restaurants = await this.prisma.restaurant.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        slug: true,
        name: true,
        isPublished: true,
        paymentProviders: { select: { id: true }, take: 1 },
        subscription: { select: { status: true } },
        orders: {
          where: { createdAt: { gte: since30 } },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        users: {
          where: { lastLogin: { gte: since7 }, isActive: true },
          select: { id: true },
        },
        _count: {
          select: {
            orders: { where: { createdAt: { gte: since30 } } },
          },
        },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    const tenants = restaurants
      .map((row) => this.mapRestaurantToScore(row))
      .filter((row) => (options?.band ? row.band === options.band : true));

    const sort = options?.sort ?? 'score_desc';
    tenants.sort((a, b) =>
      sort === 'score_asc'
        ? a.healthScore - b.healthScore
        : b.healthScore - a.healthScore,
    );

    const byBand = emptyBandCounts();
    for (const tenant of tenants) {
      byBand[tenant.band] += 1;
    }

    return {
      summary: {
        total: tenants.length,
        byBand,
      },
      tenants,
    };
  }

  async getTenantHealth(
    restaurantId: string,
  ): Promise<TenantHealthScore | null> {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, status: 'ACTIVE' },
      select: {
        id: true,
        slug: true,
        name: true,
        isPublished: true,
        paymentProviders: { select: { id: true }, take: 1 },
        subscription: { select: { status: true } },
        orders: {
          where: { createdAt: { gte: since30 } },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        users: {
          where: { lastLogin: { gte: since7 }, isActive: true },
          select: { id: true },
        },
        _count: {
          select: {
            orders: { where: { createdAt: { gte: since30 } } },
          },
        },
      },
    });

    if (!restaurant) return null;
    return this.mapRestaurantToScore(restaurant);
  }

  private mapRestaurantToScore(row: RestaurantHealthRow): TenantHealthScore {
    const ordersLast30d = row._count.orders;
    const usersActiveLast7d = row.users.length;
    const hasOnlinePayments = row.paymentProviders.length > 0;
    const lastOrderAt = row.orders[0]?.createdAt?.toISOString() ?? null;
    const subscriptionStatus = row.subscription?.status ?? null;

    const metrics = {
      isPublished: row.isPublished,
      hasOnlinePayments,
      ordersLast30d,
      usersActiveLast7d,
      subscriptionStatus,
    };

    const healthScore = computeTenantHealthScore(metrics);
    const band = resolveHealthBand(healthScore);
    const playbook = resolveHealthPlaybook(band, metrics);

    return {
      restaurantId: row.id,
      slug: row.slug,
      name: row.name,
      healthScore,
      band,
      ordersLast30d,
      usersActiveLast7d,
      hasOnlinePayments,
      isPublished: row.isPublished,
      subscriptionStatus,
      lastOrderAt,
      playbook,
    };
  }
}
