import type { EngagementChannelType } from './channel.types';

export type DeliveryStatus =
  | 'scheduled'
  | 'queued'
  | 'simulated'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface ScheduledDelivery {
  id: string;
  restaurantId: string;
  recommendationId: string;
  recommendationCode: string;
  policyId: string;
  journeyId: string;
  journeyStepId: string;
  templateId: string;
  channel: EngagementChannelType;
  status: DeliveryStatus;
  scheduledAt: string;
  deliverAt: string;
  createdAt: string;
  subject: string | null;
  bodyPreview: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  recipient?: string | null;
  sentAt?: string | null;
  externalMessageId?: string | null;
  errorMessage?: string | null;
  trace: {
    engineVersion: string;
    decisionId: string;
  };
}
