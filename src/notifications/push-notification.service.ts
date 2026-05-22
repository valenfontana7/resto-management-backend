import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface SubscribeInput {
  restaurantId: string;
  userId?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ||
      'mailto:soporte@bentoo.com.ar';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys no configuradas. Push notifications deshabilitadas.',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.enabled = true;
    this.logger.log('Push notifications inicializadas (VAPID configurado)');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async subscribe(input: SubscribeInput) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: {
        restaurantId: input.restaurantId,
        userId: input.userId ?? null,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        lastUsedAt: new Date(),
      },
      create: {
        restaurantId: input.restaurantId,
        userId: input.userId ?? null,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription
      .delete({ where: { endpoint } })
      .catch(() => undefined);
  }

  async sendToRestaurant(
    restaurantId: string,
    payload: PushPayload,
  ): Promise<number> {
    if (!this.enabled) return 0;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { restaurantId },
    });
    return this.dispatch(subs, payload);
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    return this.dispatch(subs, payload);
  }

  private async dispatch(
    subs: Array<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>,
    payload: PushPayload,
  ): Promise<number> {
    if (subs.length === 0) return 0;

    const body = JSON.stringify(payload);
    let delivered = 0;
    const staleIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            { TTL: 60 },
          );
          delivered += 1;
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            staleIds.push(sub.id);
          } else {
            this.logger.warn(
              `Fallo enviando push a ${sub.endpoint.slice(0, 60)}…: ${status ?? err?.message}`,
            );
          }
        }
      }),
    );

    if (staleIds.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: staleIds } },
      });
      this.logger.log(`Eliminadas ${staleIds.length} suscripciones expiradas`);
    }

    if (delivered > 0) {
      await this.prisma.pushSubscription.updateMany({
        where: { id: { in: subs.map((s) => s.id) } },
        data: { lastUsedAt: new Date() },
      });
    }

    return delivered;
  }
}
