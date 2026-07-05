import type { EngagementChannelType } from './channel.types';

export interface JourneyStepDefinition {
  stepId: string;
  delayDays: number;
  channel: EngagementChannelType;
  templateTrigger: string;
  goal: string;
}

export interface JourneyDefinition {
  id: string;
  name: string;
  objective: string;
  journeyType: string;
  linkedRecommendationCodes: string[];
  steps: JourneyStepDefinition[];
  frequencyCapDays: number;
  maxActiveSteps: number;
}

export interface JourneySelection {
  journeyId: string;
  journeyName: string;
  objective: string;
  journeyType: string;
  currentStep: JourneyStepDefinition;
  stepIndex: number;
  totalSteps: number;
  sourceRecommendationCode: string;
  sourceRecommendationId: string;
}
