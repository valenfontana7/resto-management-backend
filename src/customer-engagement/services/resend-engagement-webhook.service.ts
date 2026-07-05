import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { OutcomeTracker } from './outcome-tracker.service';
import { verifyResendWebhookSignature } from '../lib/resend-webhook.verify';

interface ResendWebhookPayload {
  type?: string;
  data?: {
    email_id?: string;
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
  };
}

@Injectable()
export class ResendEngagementWebhookService {
  private readonly logger = new Logger(ResendEngagementWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly persistence: EngagementPersistenceService,
    private readonly outcomeTracker: OutcomeTracker,
  ) {}

  verify(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): {
    valid: boolean;
    reason?: string;
  } {
    return verifyResendWebhookSignature(
      rawBody,
      {
        svixId: headers['svix-id'],
        svixTimestamp: headers['svix-timestamp'],
        svixSignature: headers['svix-signature'],
      },
      this.config.get<string>('RESEND_WEBHOOK_SECRET'),
    );
  }

  async handleEvent(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<{ received: boolean; processed?: boolean; reason?: string }> {
    const verification = this.verify(rawBody, headers);
    if (!verification.valid) {
      this.logger.warn(`Resend webhook rejected: ${verification.reason}`);
      return { received: false, reason: verification.reason };
    }

    let payload: ResendWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as ResendWebhookPayload;
    } catch {
      return { received: true, processed: false, reason: 'Invalid JSON' };
    }

    const outcomeType = this.mapEventType(payload.type);
    if (!outcomeType) {
      return { received: true, processed: false, reason: 'Ignored event type' };
    }

    const deliveryId = this.extractDeliveryId(payload);
    const emailId = payload.data?.email_id;

    const delivery =
      (deliveryId ? await this.persistence.getDelivery(deliveryId) : null) ??
      (emailId
        ? await this.persistence.findDeliveryByExternalMessageId(emailId)
        : null);

    if (!delivery) {
      this.logger.debug(
        `Resend webhook: delivery not found (email_id=${emailId ?? 'n/a'})`,
      );
      return { received: true, processed: false, reason: 'Delivery not found' };
    }

    const registered = await this.outcomeTracker.registerEmailEngagementEvent({
      deliveryId: delivery.id,
      type: outcomeType,
      source: 'resend_webhook',
      providerEventType: payload.type ?? 'unknown',
      providerMessageId: emailId ?? null,
    });

    return { received: true, processed: !!registered };
  }

  private mapEventType(
    type?: string,
  ): 'opened' | 'clicked' | 'unsubscribed' | null {
    switch (type) {
      case 'email.opened':
        return 'opened';
      case 'email.clicked':
        return 'clicked';
      case 'email.complained':
        return 'unsubscribed';
      default:
        return null;
    }
  }

  private extractDeliveryId(payload: ResendWebhookPayload): string | null {
    const tags = payload.data?.tags;
    if (!tags) return null;

    if (Array.isArray(tags)) {
      const hit = tags.find((t) => t.name === 'engagement_delivery_id');
      return hit?.value ?? null;
    }

    return tags.engagement_delivery_id ?? null;
  }
}
