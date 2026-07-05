import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { EmailService } from '../../email/email.service';

import { NotificationsService } from '../../notifications/notifications.service';

import { CallMeBotService } from '../../notifications/callmebot.service';

import { renderEngagementEmailHtml } from '../lib/engagement-email.renderer';

import type {
  ChannelDeliveryRequest,
  ChannelDeliveryResult,
  EngagementChannelAdapter,
} from '../types/channel.types';

import { NotificationPriority, NotificationType } from '@prisma/client';

@Injectable()
export class EmailChannelAdapter implements EngagementChannelAdapter {
  readonly channel = 'email' as const;

  private readonly logger = new Logger(EmailChannelAdapter.name);

  constructor(private readonly emailService: EmailService) {}

  async deliver(
    request: ChannelDeliveryRequest,
  ): Promise<ChannelDeliveryResult> {
    const now = new Date().toISOString();

    if (!request.recipient) {
      return {
        deliveryId: request.deliveryId,

        channel: this.channel,

        status: 'failed',

        scheduledAt: now,

        error: 'Sin email de destinatario',
      };
    }

    if (!request.subject) {
      return {
        deliveryId: request.deliveryId,

        channel: this.channel,

        status: 'failed',

        scheduledAt: now,

        error: 'Sin asunto de email',
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
      const result = await this.emailService.sendCustomerEngagementEmail({
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

      this.logger.warn(`Email delivery failed: ${message}`);

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
export class WhatsAppChannelAdapter implements EngagementChannelAdapter {
  readonly channel = 'whatsapp' as const;

  private readonly logger = new Logger(WhatsAppChannelAdapter.name);

  constructor(
    private readonly callMeBot: CallMeBotService,

    private readonly config: ConfigService,
  ) {}

  async deliver(
    request: ChannelDeliveryRequest,
  ): Promise<ChannelDeliveryResult> {
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
      this.logger.warn(`WhatsApp delivery failed for ${request.deliveryId}`);

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
export class InAppChannelAdapter implements EngagementChannelAdapter {
  readonly channel = 'in_app' as const;

  private readonly logger = new Logger(InAppChannelAdapter.name);

  constructor(private readonly notifications: NotificationsService) {}

  async deliver(
    request: ChannelDeliveryRequest,
  ): Promise<ChannelDeliveryResult> {
    const now = new Date().toISOString();

    if (!request.recipient) {
      return {
        deliveryId: request.deliveryId,

        channel: this.channel,

        status: 'failed',

        scheduledAt: now,

        error: 'Sin userId de destinatario',
      };
    }

    try {
      await this.notifications.createAndSend({
        userId: request.recipient,

        restaurantId: request.restaurantId,

        type: NotificationType.CUSTOM,

        title: request.subject ?? 'Mensaje de Bentoo',

        message: request.body.slice(0, 500),

        priority: NotificationPriority.NORMAL,

        data: {
          engagementDeliveryId: request.deliveryId,

          ctaUrl: request.ctaUrl,

          ctaLabel: request.ctaLabel,

          source: 'customer_engagement',
        },
      });

      return {
        deliveryId: request.deliveryId,

        channel: this.channel,

        status: 'sent',

        scheduledAt: now,

        error: null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`In-app delivery failed: ${message}`);

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
export class PushChannelAdapter implements EngagementChannelAdapter {
  readonly channel = 'push' as const;

  async deliver(
    request: ChannelDeliveryRequest,
  ): Promise<ChannelDeliveryResult> {
    return {
      deliveryId: request.deliveryId,

      channel: this.channel,

      status: 'simulated',

      scheduledAt: new Date().toISOString(),

      error: null,
    };
  }
}

@Injectable()
export class CsTaskChannelAdapter implements EngagementChannelAdapter {
  readonly channel = 'cs_task' as const;

  private readonly logger = new Logger(CsTaskChannelAdapter.name);

  constructor(private readonly notifications: NotificationsService) {}

  async deliver(
    request: ChannelDeliveryRequest,
  ): Promise<ChannelDeliveryResult> {
    const now = new Date().toISOString();

    if (!request.recipient) {
      this.logger.warn(
        `CS task ${request.deliveryId}: sin owner userId — logged only`,
      );

      return {
        deliveryId: request.deliveryId,

        channel: this.channel,

        status: 'simulated',

        scheduledAt: now,

        error: null,
      };
    }

    try {
      await this.notifications.createAndSend({
        userId: request.recipient,

        restaurantId: request.restaurantId,

        type: NotificationType.CUSTOM,

        title: `[CS] ${request.subject ?? 'Seguimiento Bentoo'}`,

        message: request.body.slice(0, 500),

        priority: NotificationPriority.HIGH,

        data: {
          engagementDeliveryId: request.deliveryId,

          csTask: true,

          source: 'customer_engagement',
        },
      });

      return {
        deliveryId: request.deliveryId,

        channel: this.channel,

        status: 'sent',

        scheduledAt: now,

        error: null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

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
