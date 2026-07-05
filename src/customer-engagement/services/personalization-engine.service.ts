import { Injectable } from '@nestjs/common';
import type { EngagementPersonalizationContext } from '../types/engagement.types';
import type { EngagementChannelType } from '../types/channel.types';
import type {
  PersonalizedMessage,
  TemplateDefinition,
} from '../types/template.types';

@Injectable()
export class PersonalizationEngine {
  render(
    template: TemplateDefinition,
    channel: EngagementChannelType,
    context: EngagementPersonalizationContext,
  ): PersonalizedMessage {
    const variables = this.buildVariableMap(context);
    const variablesUsed: Record<string, string> = {};

    for (const key of template.variables) {
      variablesUsed[key] = variables[key] ?? '';
    }

    return {
      templateId: template.id,
      templateVersion: template.version,
      locale: template.locale,
      channel,
      subject: template.subject
        ? this.interpolate(template.subject, variables)
        : null,
      body: this.interpolate(template.body, variables),
      ctaLabel: template.cta ? this.interpolate(template.cta, variables) : null,
      ctaUrl: context.ctaUrl,
      variablesUsed,
    };
  }

  private buildVariableMap(
    context: EngagementPersonalizationContext,
  ): Record<string, string> {
    return {
      restaurantName: context.restaurantName,
      ownerName: context.ownerName ?? '',
      firstName: context.firstName ?? 'Hola',
      daysInactive:
        context.daysInactive != null ? String(context.daysInactive) : '',
      rss: context.rss != null ? String(context.rss) : '',
      rssBand: context.rssBand ?? '',
      rssDelta7d: context.rssDelta7d != null ? String(context.rssDelta7d) : '',
      topRecommendation: context.topRecommendationTitle ?? '',
      primaryJob: context.primaryJob ?? '',
      expectedOutcome: context.expectedOutcome ?? '',
      ctaUrl: context.ctaUrl,
      adminUrl: context.adminUrl,
      tenureDays: context.tenureDays != null ? String(context.tenureDays) : '',
    };
  }

  private interpolate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      return variables[key] ?? '';
    });
  }
}
