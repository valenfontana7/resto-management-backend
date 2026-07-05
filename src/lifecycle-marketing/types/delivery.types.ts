import type { LifecycleChannelType } from './campaign.types';

export type LifecycleDeliveryStatus =
  | 'SCHEDULED'
  | 'QUEUED'
  | 'SENT'
  | 'SIMULATED'
  | 'FAILED'
  | 'CANCELLED';

export interface LifecycleDeliveryRecord {
  id: string;
  restaurantId: string;
  campaignId: string;
  campaignType: string;
  stepId: string;
  recommendationCode: string | null;
  opportunityCode: string | null;
  templateId: string;
  channel: LifecycleChannelType;
  status: LifecycleDeliveryStatus;
  recipient: string | null;
  subject: string | null;
  bodyPreview: string;
  bodyFull: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  scheduledAt: Date;
  deliverAt: Date;
  sentAt: Date | null;
  externalMessageId: string | null;
  errorMessage: string | null;
  engineVersion: string;
  createdAt: Date;
}

export type LifecycleOutcomeType =
  | 'SENT'
  | 'OPENED'
  | 'CLICKED'
  | 'REPLIED'
  | 'GOAL_COMPLETED'
  | 'IGNORED'
  | 'UNSUBSCRIBED'
  | 'RSS_CONTRIBUTION'
  | 'JOURNEY_COMPLETED';

export interface LifecycleOutcomeRecord {
  id: string;
  deliveryId: string;
  restaurantId: string;
  campaignId: string;
  campaignType: string;
  type: LifecycleOutcomeType;
  rssBefore: number | null;
  rssAfter: number | null;
  rssDelta: number | null;
  metadata: Record<string, unknown> | null;
  recordedAt: Date;
}

export interface LifecycleDashboardStats {
  days: number;
  sent: number;
  opened: number;
  clicked: number;
  goalCompleted: number;
  openRate: number;
  clickRate: number;
  journeyCompletionRate: number;
  activeCampaigns: number;
  suppressed: number;
  ttvMedianDays: number | null;
  activationRate: number | null;
  retentionRate: number | null;
  recoveryRate: number | null;
  referralRate: number | null;
}
