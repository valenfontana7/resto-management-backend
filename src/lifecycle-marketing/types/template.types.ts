import type { LifecycleChannelType } from './campaign.types';

export interface LifecycleTemplateDefinition {
  id: string;
  campaignTypes: string[];
  channel: LifecycleChannelType;
  subject?: string;
  preview?: string;
  body: string;
  variables: string[];
  tone: string;
  cta?: string;
  locale: string;
  version: string;
}

export interface LifecycleTemplateCatalogDocument {
  version: string;
  templates: LifecycleTemplateDefinition[];
}

export interface LifecyclePersonalizationContext {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  firstName: string | null;
  adminUrl: string;
  ctaUrl: string;
  daysInactive: number | null;
  tenureDays: number | null;
  rss: number | null;
  rssBand: string | null;
  rssDelta7d: number | null;
  topRecommendation: string | null;
  primaryJob: string | null;
  expectedOutcome: string | null;
  ordersLast30Days: number | null;
  nextMilestone: string | null;
}

export interface LifecyclePersonalizedMessage {
  templateId: string;
  templateVersion: string;
  locale: string;
  channel: LifecycleChannelType;
  subject: string | null;
  preview: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variablesUsed: Record<string, string>;
}
