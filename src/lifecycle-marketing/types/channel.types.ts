export interface LifecycleChannelDeliveryRequest {
  deliveryId: string;
  restaurantId: string;
  channel: string;
  recipient: string | null;
  subject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  metadata: Record<string, unknown>;
}

export interface LifecycleChannelDeliveryResult {
  deliveryId: string;
  channel: string;
  status: 'sent' | 'simulated' | 'failed';
  scheduledAt: string;
  error: string | null;
  providerMessageId?: string | null;
}

export interface LifecycleChannelAdapter {
  readonly channel: string;
  deliver(
    request: LifecycleChannelDeliveryRequest,
  ): Promise<LifecycleChannelDeliveryResult>;
}
