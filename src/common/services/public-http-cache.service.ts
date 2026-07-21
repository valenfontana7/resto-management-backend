import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PUBLIC_RESTAURANTS_CACHE_KEY,
  publicMenuCacheKey,
} from './public-http-cache.keys';

/**
 * Invalida respuestas HTTP públicas cacheadas vía CacheInterceptor / Redis.
 * Las keys deben coincidir con las usadas en los controllers públicos.
 */
@Injectable()
export class PublicHttpCacheService {
  private readonly logger = new Logger(PublicHttpCacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly prisma: PrismaService,
  ) {}

  async invalidatePublicMenuBySlug(slug: string): Promise<void> {
    const normalized = String(slug || '')
      .trim()
      .toLowerCase();
    if (!normalized) return;

    try {
      await this.cache.del(publicMenuCacheKey(normalized));
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate public menu cache for slug=${normalized}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async invalidatePublicMenuByRestaurantId(
    restaurantId: string,
  ): Promise<void> {
    if (!restaurantId) return;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    });

    if (!restaurant?.slug) return;

    await this.invalidatePublicMenuBySlug(restaurant.slug);
  }

  async invalidatePublicRestaurants(): Promise<void> {
    try {
      await this.cache.del(PUBLIC_RESTAURANTS_CACHE_KEY);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate public restaurants cache: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
