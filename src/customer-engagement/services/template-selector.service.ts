import { Injectable } from '@nestjs/common';
import { findTemplate } from '../catalog/template-catalog.loader';
import type { EngagementChannelType } from '../types/channel.types';
import type { JourneySelection } from '../types/journey.types';
import type { TemplateDefinition } from '../types/template.types';

@Injectable()
export class TemplateSelector {
  select(input: {
    recommendationCode: string;
    journey: JourneySelection;
    channel: EngagementChannelType;
  }): TemplateDefinition | null {
    const byTrigger = findTemplate({
      trigger: input.journey.currentStep.templateTrigger,
      recommendationCode: input.recommendationCode,
      channel: input.channel,
    });
    if (byTrigger) return byTrigger;

    return findTemplate({
      recommendationCode: input.recommendationCode,
      channel: input.channel,
    });
  }
}
