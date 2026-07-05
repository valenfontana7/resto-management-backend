import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../email/email.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CallMeBotService } from '../../notifications/callmebot.service';
import { renderEngagementEmailHtml } from '../../customer-engagement/lib/engagement-email.renderer';
import type {
  LifecycleChannelAdapter,
  LifecycleChannelDeliveryRequest,
  LifecycleChannelDeliveryResult,
} from '../types/channel.types';
import { NotificationPriority, NotificationType } from '@prisma/client';

@Injectable()
export class LifecycleEmailChannelAdapter implements LifecycleChannelAdapter {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(LifecycleEmailChannelAdapter.name);

  constructor(private readonly emailService: EmailService) {}

  async deliver(
    request: LifecycleChannelDeliveryRequest,
  ): Promise<LifecycleChannelDeliveryResult> {
    const now = new Date().toISOString();
    if (!request.recipient || !request.subject) {
      return {
        deliveryId: request.deliveryId,
        channel: this.channel,
        status: 'failed',
        scheduledAt: now,
        error: 'Sin destinatario o asunto',
      };
    }

    const html = renderEngagementEmailHtml({
      subject: request.subject,
      bodyPlain: request.body,
      ctaLabel: request.ctaLabel,
      ctaUrl: request.ctaUrl,
      restaurantName:
        typeof request.metadata.restaurantName === 'string'
          ? request.metadata.restaurantName
          : undefined,
    });

    try {
      const result = await this.emailService.sendLifecycleMarketingEmail({
        to: request.recipient,
        subject: request.subject,
        html,
        deliveryId: request.deliveryId,
      });

      if (!result.ok) {
        return {
          deliveryId: request.deliveryId,
          channel: this.channel,
          status: 'failed',
          scheduledAt: now,
          error: 'EmailService returned false',
        };
      }

      return {
        deliveryId: request.deliveryId,
        channel: this.channel,
        status: result.simulated ? 'simulated' : 'sent',
        scheduledAt: now,
        error: null,
        providerMessageId: result.providerId ?? null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Lifecycle email failed: ${message}`);
      return {
        deliveryId: request.deliveryId,
        channel: this.channel,
        status: 'failed',
        scheduledAt: now,
        error: message,
      };
    }
  }
}

@Injectable()
export class LifecycleWhatsAppChannelAdapter
  implements LifecycleChannelAdapter
{
  readonly channel = 'whatsapp' as const;
  private readonly logger = new Logger(LifecycleWhatsAppChannelAdapter.name);

  constructor(
    private readonly callMeBot: CallMeBotService,
    private readonly config: ConfigService,
  ) {}

  async deliver(
    request: LifecycleChannelDeliveryRequest,
  ): Promise<LifecycleChannelDeliveryResult> {
    const now = new Date().toISOString();
    const apiKey = this.config.get<string>('ENGAGEMENT_CALLMEBOT_API_KEY');

    if (!request.recipient || !apiKey) {
      return {
        deliveryId: request.deliveryId,
        channel: this.channel,
        status: 'simulated',
        scheduledAt: now,
        error: null,
      };
    }

    const text = request.subject
      ? `${request.subject}\n\n${request.body}`
      : request.body;
    const ok = await this.callMeBot.sendMessage(
      request.recipient,
      apiKey,
      text.slice(0, 900),
    );

    if (!ok) {
      this.logger.warn(`WhatsApp lifecycle failed for ${request.deliveryId}`);
      return {
        deliveryId: request.deliveryId,
        channel: this.channel,
        status: 'failed',
        scheduledAt: now,
        error: 'CallMeBot send failed',
      };
    }

    return {
      deliveryId: request.deliveryId,
      channel: this.channel,
      status: 'sent',
      scheduledAt: now,
      error: null,
    };
  }
}

@Injectable()
export class LifecycleInAppChannelAdapter implements LifecycleChannelAdapter {
  readonly channel = 'in_app' as const;

  constructor(private readonly notifications: NotificationsService) {}

  async deliver(
    request: LifecycleChannelDeliveryRequest,
  ): Promise<LifecycleChannelDeliveryResult> {
    const now = new Date().toISOString();
    if (!request.recipient) {
      return {
        deliveryId: request.deliveryId,
        channel: this.channel,
        status: 'failed',
        scheduledAt: now,
        error: 'Sin userId',
      };
    }

    await this.notifications.createAndSend({
      userId: request.recipient,
      restaurantId: request.restaurantId,
      type: NotificationType.CUSTOM,
      title: request.subject ?? 'Bentoo',
      message: request.body.slice(0, 500),
      priority: NotificationPriority.NORMAL,
      data: {
        lifecycleDeliveryId: request.deliveryId,
        ctaUrl: request.ctaUrl,
        source: 'lifecycle_marketing',
      },
    });

    return {
      deliveryId: request.deliveryId,
      channel: this.channel,
      status: 'sent',
      scheduledAt: now,
      error: null,
    };
  }
}

@Injectable()
export class LifecycleCsTaskChannelAdapter implements LifecycleChannelAdapter {
  readonly channel = 'cs_task' as const;

  constructor(private readonly notifications: NotificationsService) {}

  async deliver(
    request: LifecycleChannelDeliveryRequest,
  ): Promise<LifecycleChannelDeliveryResult> {
    const now = new Date().toISOString();

    if (!request.recipient) {
      return {
        deliveryId: request.deliveryId,
        channel: this.channel,
        status: 'simulated',
        scheduledAt: now,
        error: null,
      };
    }

    await this.notifications.createAndSend({
      userId: request.recipient,
      restaurantId: request.restaurantId,
      type: NotificationType.CUSTOM,
      title: `[CS Lifecycle] ${request.subject ?? 'Seguimiento'}`,
      message: request.body.slice(0, 500),
      priority: NotificationPriority.HIGH,
      data: {
        lifecycleDeliveryId: request.deliveryId,
        csTask: true,
        source: 'lifecycle_marketing',
      },
    });

    return {
      deliveryId: request.deliveryId,
      channel: this.channel,
      status: 'sent',
      scheduledAt: now,
      error: null,
    };
  }
}

@Injectable()
export class LifecyclePushChannelAdapter implements LifecycleChannelAdapter {
  readonly channel = 'push' as const;

  async deliver(
    request: LifecycleChannelDeliveryRequest,
  ): Promise<LifecycleChannelDeliveryResult> {
    return {
      deliveryId: request.deliveryId,
      channel: this.channel,
      status: 'simulated',
      scheduledAt: new Date().toISOString(),
      error: null,
    };
  }
}
