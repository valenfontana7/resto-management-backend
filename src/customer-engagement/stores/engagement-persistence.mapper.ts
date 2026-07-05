import type {
  EngagementDeliveryStatus as PrismaDeliveryStatus,
  EngagementOutcomeType as PrismaOutcomeType,
} from '@prisma/client';
import type {
  ScheduledDelivery,
  DeliveryStatus,
} from '../types/delivery.types';
import type {
  EngagementOutcomeRecord,
  EngagementOutcomeType,
} from '../types/outcome.types';
import type { EngagementDecisionTrace } from '../types/engagement.types';

const DELIVERY_STATUS_TO_DOMAIN: Record<PrismaDeliveryStatus, DeliveryStatus> =
  {
    SCHEDULED: 'scheduled',
    QUEUED: 'queued',
    SENT: 'sent',
    SIMULATED: 'simulated',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  };

const DELIVERY_STATUS_TO_PRISMA: Record<DeliveryStatus, PrismaDeliveryStatus> =
  {
    scheduled: 'SCHEDULED',
    queued: 'QUEUED',
    sent: 'SENT',
    simulated: 'SIMULATED',
    failed: 'FAILED',
    cancelled: 'CANCELLED',
  };

const OUTCOME_TYPE_TO_DOMAIN: Record<PrismaOutcomeType, EngagementOutcomeType> =
  {
    OPENED: 'opened',
    CLICKED: 'clicked',
    REPLIED: 'replied',
    GOAL_COMPLETED: 'goal_completed',
    IGNORED: 'ignored',
    UNSUBSCRIBED: 'unsubscribed',
    RSS_CONTRIBUTION: 'rss_contribution',
  };

const OUTCOME_TYPE_TO_PRISMA: Record<EngagementOutcomeType, PrismaOutcomeType> =
  {
    opened: 'OPENED',
    clicked: 'CLICKED',
    replied: 'REPLIED',
    goal_completed: 'GOAL_COMPLETED',
    ignored: 'IGNORED',
    unsubscribed: 'UNSUBSCRIBED',
    rss_contribution: 'RSS_CONTRIBUTION',
  };

export function mapDeliveryRow(row: {
  id: string;
  restaurantId: string;
  decisionId: string | null;
  recommendationId: string;
  recommendationCode: string;
  policyId: string;
  journeyId: string;
  journeyStepId: string;
  templateId: string;
  channel: string;
  status: PrismaDeliveryStatus;
  recipient: string | null;
  subject: string | null;
  bodyPreview: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  scheduledAt: Date;
  deliverAt: Date;
  sentAt: Date | null;
  externalMessageId: string | null;
  errorMessage: string | null;
  engineVersion: string;
  createdAt: Date;
}): ScheduledDelivery {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    recommendationId: row.recommendationId,
    recommendationCode: row.recommendationCode,
    policyId: row.policyId,
    journeyId: row.journeyId,
    journeyStepId: row.journeyStepId,
    templateId: row.templateId,
    channel: row.channel as ScheduledDelivery['channel'],
    status: DELIVERY_STATUS_TO_DOMAIN[row.status],
    scheduledAt: row.scheduledAt.toISOString(),
    deliverAt: row.deliverAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    subject: row.subject,
    bodyPreview: row.bodyPreview,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    trace: {
      engineVersion: row.engineVersion,
      decisionId: row.decisionId ?? row.id,
    },
    recipient: row.recipient,
    sentAt: row.sentAt?.toISOString() ?? null,
    externalMessageId: row.externalMessageId,
    errorMessage: row.errorMessage,
  };
}

export function mapOutcomeRow(row: {
  id: string;
  deliveryId: string;
  restaurantId: string;
  recommendationCode: string;
  type: PrismaOutcomeType;
  rssBefore: number | null;
  rssAfter: number | null;
  rssDelta: number | null;
  metadata: unknown;
  recordedAt: Date;
}): EngagementOutcomeRecord {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    restaurantId: row.restaurantId,
    recommendationCode: row.recommendationCode,
    type: OUTCOME_TYPE_TO_DOMAIN[row.type],
    recordedAt: row.recordedAt.toISOString(),
    rssBefore: row.rssBefore,
    rssAfter: row.rssAfter,
    rssDelta: row.rssDelta,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export function toPrismaDeliveryStatus(
  status: DeliveryStatus,
): PrismaDeliveryStatus {
  return DELIVERY_STATUS_TO_PRISMA[status];
}

export function toPrismaOutcomeType(
  type: EngagementOutcomeType,
): PrismaOutcomeType {
  return OUTCOME_TYPE_TO_PRISMA[type];
}

export type SaveDecisionInput = {
  id: string;
  restaurantId: string;
  recommendationId: string;
  recommendationCode: string;
  policyId: string;
  shouldCommunicate: boolean;
  policyReason: string;
  journeyId: string | null;
  channel: string | null;
  templateId: string | null;
  trace: EngagementDecisionTrace;
  engineVersion: string;
};

export type SaveDeliveryInput = {
  id: string;
  restaurantId: string;
  decisionId: string | null;
  recommendationId: string;
  recommendationCode: string;
  policyId: string;
  journeyId: string;
  journeyStepId: string;
  templateId: string;
  channel: string;
  status: DeliveryStatus;
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
