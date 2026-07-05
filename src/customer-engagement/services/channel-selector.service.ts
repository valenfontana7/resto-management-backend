import { Injectable } from '@nestjs/common';
import type { EngagementPolicyDefinition } from '../types/engagement-policy.types';
import type { EngagementChannelType } from '../types/channel.types';
import type { JourneySelection } from '../types/journey.types';

@Injectable()
export class ChannelSelector {
  select(
    journey: JourneySelection,
    policy: EngagementPolicyDefinition,
  ): EngagementChannelType {
    const stepChannel = journey.currentStep.channel;
    if (policy.preferredChannels.includes(stepChannel)) {
      return stepChannel;
    }

    for (const preferred of policy.preferredChannels) {
      if (preferred === stepChannel) return preferred;
    }

    return policy.preferredChannels[0] ?? stepChannel;
  }
}
