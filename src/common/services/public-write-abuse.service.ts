import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

export type PublicWriteScope = 'order' | 'reservation' | 'review';

export interface PublicWriteGuardContext {
  ip: string;
  scope: PublicWriteScope;
  restaurantId?: string;
}

interface ScopeLimits {
  maxPerIpHour: number;
  maxPerRestaurantHour?: number;
}

@Injectable()
export class PublicWriteAbuseService {
  private readonly logger = new Logger(PublicWriteAbuseService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async assertPublicWriteAllowed(ctx: PublicWriteGuardContext): Promise<void> {
    const limits = this.getLimits(ctx.scope);
    const normalizedIp = ctx.ip.trim() || 'unknown';

    const ipKey = `pub-write:ip:${ctx.scope}:${normalizedIp}`;
    const ipCount = (await this.cache.get<number>(ipKey)) ?? 0;
    if (ipCount >= limits.maxPerIpHour) {
      this.logger.warn(
        `Public write blocked (${ctx.scope}) ip=${normalizedIp} count=${ipCount + 1}`,
      );
      throw new HttpException(
        'Demasiados intentos desde esta conexión. Probá más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ctx.restaurantId && limits.maxPerRestaurantHour) {
      const restaurantKey = `pub-write:restaurant:${ctx.scope}:${ctx.restaurantId}:${normalizedIp}`;
      const restaurantCount =
        (await this.cache.get<number>(restaurantKey)) ?? 0;
      if (restaurantCount >= limits.maxPerRestaurantHour) {
        this.logger.warn(
          `Public write blocked (${ctx.scope}) restaurant=${ctx.restaurantId} ip=${normalizedIp}`,
        );
        throw new HttpException(
          'Demasiados intentos para este local. Probá más tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.cache.set(restaurantKey, restaurantCount + 1, 60 * 60 * 1000);
    }

    await this.cache.set(ipKey, ipCount + 1, 60 * 60 * 1000);
  }

  private getLimits(scope: PublicWriteScope): ScopeLimits {
    switch (scope) {
      case 'order':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_WRITE_ORDERS_MAX_PER_IP_HOUR',
            12,
          ),
          maxPerRestaurantHour: this.readIntEnv(
            'PUBLIC_WRITE_ORDERS_MAX_PER_RESTAURANT_IP_HOUR',
            8,
          ),
        };
      case 'reservation':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_WRITE_RESERVATIONS_MAX_PER_IP_HOUR',
            8,
          ),
          maxPerRestaurantHour: this.readIntEnv(
            'PUBLIC_WRITE_RESERVATIONS_MAX_PER_RESTAURANT_IP_HOUR',
            5,
          ),
        };
      case 'review':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_WRITE_REVIEWS_MAX_PER_IP_HOUR',
            6,
          ),
        };
      default:
        return { maxPerIpHour: 10 };
    }
  }

  private readIntEnv(key: string, fallback: number): number {
    const raw = process.env[key]?.trim();
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
