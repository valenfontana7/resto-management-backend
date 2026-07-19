import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ExecutionContextService } from '../execution/execution-context.service';

export type PublicWriteScope =
  | 'order'
  | 'reservation'
  | 'review'
  | 'loyalty_lookup'
  | 'delivery_quote'
  | 'login_intent'
  | 'login_attempt'
  | 'activation_code'
  | 'customer_session'
  | 'customer_profile'
  | 'coupon_validate'
  | 'token_lookup'
  | 'public_read'
  | 'kitchen_sse'
  | 'edge_sync';

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

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Optional() private readonly executionContext?: ExecutionContextService,
  ) {}

  async assertPublicWriteAllowed(ctx: PublicWriteGuardContext): Promise<void> {
    if (this.executionContext?.get()) {
      return;
    }
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
      case 'loyalty_lookup':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_WRITE_LOYALTY_LOOKUP_MAX_PER_IP_HOUR',
            20,
          ),
        };
      case 'delivery_quote':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_WRITE_DELIVERY_QUOTE_MAX_PER_IP_HOUR',
            40,
          ),
          maxPerRestaurantHour: this.readIntEnv(
            'PUBLIC_WRITE_DELIVERY_QUOTE_MAX_PER_RESTAURANT_IP_HOUR',
            25,
          ),
        };
      case 'login_intent':
        return {
          maxPerIpHour: this.readIntEnv(
            'AUTH_LOGIN_INTENT_MAX_PER_IP_HOUR',
            30,
          ),
        };
      case 'login_attempt':
        return {
          maxPerIpHour: this.readIntEnv('AUTH_LOGIN_MAX_PER_IP_HOUR', 40),
        };
      case 'activation_code':
        return {
          maxPerIpHour: this.readIntEnv(
            'AUTH_ACTIVATION_CODE_MAX_PER_IP_HOUR',
            20,
          ),
        };
      case 'customer_session':
        return {
          maxPerIpHour: this.readIntEnv(
            'AUTH_CUSTOMER_SESSION_MAX_PER_IP_HOUR',
            10,
          ),
        };
      case 'customer_profile':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_WRITE_CUSTOMER_PROFILE_MAX_PER_IP_HOUR',
            30,
          ),
          maxPerRestaurantHour: this.readIntEnv(
            'PUBLIC_WRITE_CUSTOMER_PROFILE_MAX_PER_RESTAURANT_IP_HOUR',
            20,
          ),
        };
      case 'coupon_validate':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_WRITE_COUPON_VALIDATE_MAX_PER_IP_HOUR',
            30,
          ),
          maxPerRestaurantHour: this.readIntEnv(
            'PUBLIC_WRITE_COUPON_VALIDATE_MAX_PER_RESTAURANT_IP_HOUR',
            20,
          ),
        };
      case 'token_lookup':
        return {
          maxPerIpHour: this.readIntEnv(
            'PUBLIC_TOKEN_LOOKUP_MAX_PER_IP_HOUR',
            60,
          ),
          maxPerRestaurantHour: this.readIntEnv(
            'PUBLIC_TOKEN_LOOKUP_MAX_PER_RESTAURANT_IP_HOUR',
            40,
          ),
        };
      case 'public_read':
        return {
          maxPerIpHour: this.readIntEnv('PUBLIC_READ_MAX_PER_IP_HOUR', 180),
          maxPerRestaurantHour: this.readIntEnv(
            'PUBLIC_READ_MAX_PER_RESTAURANT_IP_HOUR',
            90,
          ),
        };
      case 'kitchen_sse':
        return {
          maxPerIpHour: this.readIntEnv('KITCHEN_SSE_MAX_PER_IP_HOUR', 30),
          maxPerRestaurantHour: this.readIntEnv(
            'KITCHEN_SSE_MAX_PER_RESTAURANT_IP_HOUR',
            20,
          ),
        };
      case 'edge_sync':
        return {
          maxPerIpHour: this.readIntEnv('EDGE_SYNC_MAX_PER_IP_HOUR', 240),
          maxPerRestaurantHour: this.readIntEnv(
            'EDGE_SYNC_MAX_PER_RESTAURANT_IP_HOUR',
            180,
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
