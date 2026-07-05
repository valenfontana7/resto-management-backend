import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

type RssBand =
  | 'champion'
  | 'healthy'
  | 'attention'
  | 'at_risk'
  | 'critical'
  | 'unknown';

@Injectable()
export class MarketingSegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRestaurantSegments() {
    const [activeRestaurants, trialingCount, cacheRows] = await Promise.all([
      this.prisma.restaurant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({
        where: {
          isBillingAnchor: true,
          status: SubscriptionStatus.TRIALING,
        },
      }),
      this.prisma.restaurantIntelligenceSnapshotCache.findMany({
        select: { bundle: true },
      }),
    ]);

    const byBand: Record<RssBand, number> = {
      champion: 0,
      healthy: 0,
      attention: 0,
      at_risk: 0,
      critical: 0,
      unknown: 0,
    };

    for (const row of cacheRows) {
      const bundle = row.bundle as {
        snapshot?: { rss?: { band?: string } };
      };
      const band = (bundle?.snapshot?.rss?.band ?? 'unknown') as RssBand;
      if (band in byBand) byBand[band]++;
      else byBand.unknown++;
    }

    const restaurantsWithCache = cacheRows.length;
    const uncached = Math.max(0, activeRestaurants - restaurantsWithCache);

    return {
      activeRestaurants,
      onboardingRestaurants: trialingCount + byBand.attention,
      atRiskRestaurants: byBand.at_risk + byBand.critical,
      championRestaurants: byBand.champion,
      healthyRestaurants: byBand.healthy,
      uncachedRestaurants: uncached,
      byRssBand: byBand,
      dataNote:
        uncached > 0
          ? `${uncached} restaurantes activos sin snapshot de inteligencia cacheado — ejecutar evaluate batch para segmentación completa.`
          : null,
    };
  }
}
