import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { Subject, Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { REDIS_CLIENT } from '../common/redis/redis.constants';

export interface KitchenNotification {
  type:
    | 'order_created'
    | 'order_updated'
    | 'order_cancelled'
    | 'order_ready'
    | 'in_app';
  orderId?: string;
  notificationId?: string;
  restaurantId: string;
  data: unknown;
  timestamp: Date;
}

const KITCHEN_CHANNEL_PREFIX = 'bentoo:kitchen:';

/**
 * Notificaciones cocina con fallback in-memory y pub/sub Redis en producción.
 * Permite escalar horizontalmente cuando REDIS_URL está configurado.
 */
@Injectable()
export class KitchenNotificationsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KitchenNotificationsService.name);
  private readonly localSubjects = new Map<
    string,
    Subject<KitchenNotification>
  >();
  private redisSubscriber: Redis | null = null;
  private readonly useRedis: boolean;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {
    this.useRedis =
      Boolean(this.redis) && this.config.get('NODE_ENV') === 'production';
  }

  async onModuleInit(): Promise<void> {
    if (!this.redis) return;

    try {
      this.redisSubscriber = this.redis.duplicate();
      await this.redisSubscriber.connect();
      await this.redisSubscriber.psubscribe(`${KITCHEN_CHANNEL_PREFIX}*`);
      this.redisSubscriber.on('pmessage', (_pattern, channel, message) => {
        const restaurantId = channel.replace(KITCHEN_CHANNEL_PREFIX, '');
        try {
          const notification = JSON.parse(message) as KitchenNotification;
          this.localSubjects.get(restaurantId)?.next(notification);
        } catch (error) {
          this.logger.warn(`Invalid kitchen pub/sub payload: ${String(error)}`);
        }
      });
      this.logger.log('Kitchen notifications: Redis pub/sub active');
    } catch (error) {
      this.logger.warn(
        `Kitchen Redis pub/sub unavailable, using in-memory only: ${String(error)}`,
      );
      this.redisSubscriber = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit().catch(() => undefined);
    }
  }

  getNotificationsForRestaurant(
    restaurantId: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const subject = this.getOrCreateSubject(restaurantId);

      const subscription = subject.subscribe((notification) => {
        observer.next({
          data: JSON.stringify(notification),
          type: notification.type,
          id: notification.orderId,
        });
      });

      return () => subscription.unsubscribe();
    });
  }

  emitNotification(
    restaurantId: string,
    notification: Omit<KitchenNotification, 'restaurantId' | 'timestamp'>,
  ): void {
    const fullNotification: KitchenNotification = {
      ...notification,
      restaurantId,
      timestamp: new Date(),
    };

    this.getOrCreateSubject(restaurantId).next(fullNotification);

    if (this.redis && this.useRedis) {
      void this.redis
        .publish(
          `${KITCHEN_CHANNEL_PREFIX}${restaurantId}`,
          JSON.stringify(fullNotification),
        )
        .catch((error) => {
          this.logger.warn(`Kitchen publish failed: ${error.message}`);
        });
    }
  }

  getActiveConnectionsCount(restaurantId: string): number {
    return this.localSubjects.has(restaurantId) ? 1 : 0;
  }

  getConnectionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [restaurantId] of this.localSubjects) {
      stats[restaurantId] = 1;
    }
    return stats;
  }

  private getOrCreateSubject(
    restaurantId: string,
  ): Subject<KitchenNotification> {
    if (!this.localSubjects.has(restaurantId)) {
      this.localSubjects.set(restaurantId, new Subject<KitchenNotification>());
    }
    return this.localSubjects.get(restaurantId)!;
  }
}
