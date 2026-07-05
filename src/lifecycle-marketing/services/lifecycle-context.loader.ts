import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';
import type { RestaurantSuccessSnapshot } from '../../decision-engine/rss/types/restaurant-success-snapshot.types';
import type { LifecyclePersonalizationContext } from '../types/template.types';

@Injectable()
export class LifecycleContextLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async loadPersonalizationContext(
    restaurantId: string,
    snapshot: RestaurantSuccessSnapshot,
    recommendation: DetectedRecommendation | null,
    campaignExpectedOutcome?: string | null,
  ): Promise<LifecyclePersonalizationContext> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        memberships: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const owner = restaurant?.memberships[0]?.user ?? null;
    const firstName = owner?.name?.split(/\s+/)[0] ?? null;
    const frontendBase =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ??
      'https://bentoo.com.ar';

    const ordersLast30Days = await this.prisma.order.count({
      where: {
        restaurantId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    return {
      restaurantId,
      restaurantName: restaurant?.name ?? 'tu restaurante',
      restaurantSlug: restaurant?.slug ?? restaurantId,
      ownerUserId: owner?.id ?? null,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? restaurant?.email ?? null,
      ownerPhone: restaurant?.phone ?? null,
      firstName,
      adminUrl: `${frontendBase}/admin`,
      ctaUrl: `${frontendBase}/admin`,
      daysInactive: this.deriveDaysInactive(snapshot),
      tenureDays: snapshot.metadata.tenureDays ?? null,
      rss: snapshot.rss.value,
      rssBand: snapshot.rss.band,
      rssDelta7d: snapshot.rss.delta7d,
      topRecommendation: recommendation?.title ?? null,
      primaryJob: recommendation?.primaryJob ?? snapshot.primaryJob,
      expectedOutcome:
        campaignExpectedOutcome ?? recommendation?.expectedOutcome ?? null,
      ordersLast30Days,
      nextMilestone: this.deriveNextMilestone(ordersLast30Days),
    };
  }

  private deriveDaysInactive(
    snapshot: RestaurantSuccessSnapshot,
  ): number | null {
    if (snapshot.rss.trend7d === 'down' && snapshot.rss.delta7d != null) {
      return Math.max(7, Math.abs(Math.round(snapshot.rss.delta7d)));
    }
    return null;
  }

  private deriveNextMilestone(ordersLast30Days: number): string | null {
    if (ordersLast30Days >= 100) return '100 pedidos en 30 días';
    if (ordersLast30Days >= 50) return '50 pedidos en 30 días';
    if (ordersLast30Days >= 10) return '10 pedidos en 30 días';
    return 'Primer pedido real';
  }
}
