import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';
import type { RestaurantSuccessSnapshot } from '../../decision-engine/rss/types/restaurant-success-snapshot.types';
import type { EngagementPersonalizationContext } from '../types/engagement.types';

@Injectable()
export class EngagementContextLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Carga metadata del restaurante solo para personalización de mensajes.
   * Las decisiones de engagement provienen exclusivamente de Recommendations.
   */
  async loadPersonalizationContext(
    restaurantId: string,
    snapshot: RestaurantSuccessSnapshot,
    recommendation: DetectedRecommendation | null,
  ): Promise<EngagementPersonalizationContext> {
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
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    const owner = restaurant?.memberships[0]?.user ?? null;
    const firstName = owner?.name?.split(/\s+/)[0] ?? null;
    const frontendBase =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ??
      'https://bentoo.com.ar';

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
      topRecommendationTitle: recommendation?.title ?? null,
      primaryJob: recommendation?.primaryJob ?? snapshot.primaryJob,
      expectedOutcome: recommendation?.expectedOutcome ?? null,
    };
  }

  private deriveDaysInactive(
    snapshot: RestaurantSuccessSnapshot,
  ): number | null {
    if (snapshot.rss.trend7d === 'down' && snapshot.rss.delta7d != null) {
      return Math.max(7, Math.abs(Math.round(snapshot.rss.delta7d)));
    }
    return snapshot.metadata.tenureDays ?? null;
  }
}
