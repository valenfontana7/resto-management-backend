import type {
  LifecycleDeliveryStatus as PrismaDeliveryStatus,
  LifecycleOutcomeType as PrismaOutcomeType,
  LifecycleActiveCampaignStatus as PrismaActiveStatus,
} from '@prisma/client';
import type {
  LifecycleDeliveryRecord,
  LifecycleDeliveryStatus,
  LifecycleOutcomeRecord,
  LifecycleOutcomeType,
} from '../types/delivery.types';
import type { LifecycleCampaignType } from '../types/campaign.types';

const DELIVERY_STATUS_TO_DOMAIN: Record<
  PrismaDeliveryStatus,
  LifecycleDeliveryStatus
> = {
  SCHEDULED: 'SCHEDULED',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  SIMULATED: 'SIMULATED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

const DELIVERY_STATUS_TO_PRISMA: Record<
  LifecycleDeliveryStatus,
  PrismaDeliveryStatus
> = {
  SCHEDULED: 'SCHEDULED',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  SIMULATED: 'SIMULATED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

const OUTCOME_TYPE_TO_DOMAIN: Record<PrismaOutcomeType, LifecycleOutcomeType> =
  {
    SENT: 'SENT',
    OPENED: 'OPENED',
    CLICKED: 'CLICKED',
    REPLIED: 'REPLIED',
    GOAL_COMPLETED: 'GOAL_COMPLETED',
    IGNORED: 'IGNORED',
    UNSUBSCRIBED: 'UNSUBSCRIBED',
    RSS_CONTRIBUTION: 'RSS_CONTRIBUTION',
    JOURNEY_COMPLETED: 'JOURNEY_COMPLETED',
  };

const OUTCOME_TYPE_TO_PRISMA: Record<LifecycleOutcomeType, PrismaOutcomeType> =
  {
    SENT: 'SENT',
    OPENED: 'OPENED',
    CLICKED: 'CLICKED',
    REPLIED: 'REPLIED',
    GOAL_COMPLETED: 'GOAL_COMPLETED',
    IGNORED: 'IGNORED',
    UNSUBSCRIBED: 'UNSUBSCRIBED',
    RSS_CONTRIBUTION: 'RSS_CONTRIBUTION',
    JOURNEY_COMPLETED: 'JOURNEY_COMPLETED',
  };

export function mapDeliveryRow(row: {
  id: string;
  restaurantId: string;
  campaignId: string;
  campaignType: string;
  stepId: string;
  recommendationCode: string | null;
  opportunityCode: string | null;
  templateId: string;
  channel: string;
  status: PrismaDeliveryStatus;
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
}): LifecycleDeliveryRecord {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    campaignId: row.campaignId,
    campaignType: row.campaignType,
    stepId: row.stepId,
    recommendationCode: row.recommendationCode,
    opportunityCode: row.opportunityCode,
    templateId: row.templateId,
    channel: row.channel as LifecycleDeliveryRecord['channel'],
    status: DELIVERY_STATUS_TO_DOMAIN[row.status],
    recipient: row.recipient,
    subject: row.subject,
    bodyPreview: row.bodyPreview,
    bodyFull: row.bodyFull,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    scheduledAt: row.scheduledAt,
    deliverAt: row.deliverAt,
    sentAt: row.sentAt,
    externalMessageId: row.externalMessageId,
    errorMessage: row.errorMessage,
    engineVersion: row.engineVersion,
    createdAt: row.createdAt,
  };
}

export function mapOutcomeRow(row: {
  id: string;
  deliveryId: string;
  restaurantId: string;
  campaignId: string;
  campaignType: string;
  type: PrismaOutcomeType;
  rssBefore: number | null;
  rssAfter: number | null;
  rssDelta: number | null;
  metadata: unknown;
  recordedAt: Date;
}): LifecycleOutcomeRecord {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    restaurantId: row.restaurantId,
    campaignId: row.campaignId,
    campaignType: row.campaignType,
    type: OUTCOME_TYPE_TO_DOMAIN[row.type],
    rssBefore: row.rssBefore,
    rssAfter: row.rssAfter,
    rssDelta: row.rssDelta,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    recordedAt: row.recordedAt,
  };
}

export function toPrismaDeliveryStatus(
  status: LifecycleDeliveryStatus,
): PrismaDeliveryStatus {
  return DELIVERY_STATUS_TO_PRISMA[status];
}

export function toPrismaOutcomeType(
  type: LifecycleOutcomeType,
): PrismaOutcomeType {
  return OUTCOME_TYPE_TO_PRISMA[type];
}

export function toPrismaActiveStatus(
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SUPERSEDED',
): PrismaActiveStatus {
  return status;
}

export type SaveCampaignRunInput = {
  id: string;
  restaurantId: string;
  campaignId: string;
  campaignType: LifecycleCampaignType;
  recommendationCode: string | null;
  opportunityCode: string | null;
  shouldCommunicate: boolean;
  reason: string;
  intelligenceBacked: boolean;
  channel: string | null;
  templateId: string | null;
  trace: Record<string, unknown>;
  engineVersion: string;
};

export type SaveLifecycleDeliveryInput = {
  id: string;
  restaurantId: string;
  campaignRunId: string | null;
  campaignId: string;
  campaignType: LifecycleCampaignType;
  stepId: string;
  recommendationCode: string | null;
  opportunityCode: string | null;
  templateId: string;
  channel: string;
  status: LifecycleDeliveryStatus;
  recipient: string | null;
  subject: string | null;
  bodyPreview: string;
  bodyFull: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  scheduledAt: Date;
  deliverAt: Date;
  sentAt?: Date | null;
  externalMessageId?: string | null;
  errorMessage?: string | null;
  engineVersion: string;
};
