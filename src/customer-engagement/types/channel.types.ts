export const ENGAGEMENT_CHANNEL_TYPES = [
  'email',
  'whatsapp',
  'in_app',
  'push',
  'cs_task',
] as const;

export type EngagementChannelType = (typeof ENGAGEMENT_CHANNEL_TYPES)[number];

export interface ChannelDeliveryRequest {
  deliveryId: string;
  restaurantId: string;
  channel: EngagementChannelType;
  recipient: string | null;
  subject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  metadata: Record<string, unknown>;
}

export interface ChannelDeliveryResult {
  deliveryId: string;
  channel: EngagementChannelType;
  status: 'scheduled' | 'simulated' | 'sent' | 'failed';
  scheduledAt: string;
  error: string | null;
  providerMessageId?: string | null;
}

export interface EngagementChannelAdapter {
  readonly channel: EngagementChannelType;
  deliver(request: ChannelDeliveryRequest): Promise<ChannelDeliveryResult>;
}
