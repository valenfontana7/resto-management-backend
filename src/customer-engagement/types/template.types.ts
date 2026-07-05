import type { EngagementChannelType } from './channel.types';

export interface TemplateDefinition {
  id: string;
  trigger: string;
  strategy: string;
  tone: string;
  goal: string;
  variables: string[];
  subject: string | null;
  body: string;
  cta: string | null;
  expectedOutcome: string;
  version: string;
  locale: string;
  linkedRecommendationCodes: string[];
  supportedChannels: EngagementChannelType[];
}

export interface PersonalizedMessage {
  templateId: string;
  templateVersion: string;
  locale: string;
  channel: EngagementChannelType;
  subject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variablesUsed: Record<string, string>;
}
