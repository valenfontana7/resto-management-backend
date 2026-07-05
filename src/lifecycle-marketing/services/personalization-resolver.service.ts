import { Injectable } from '@nestjs/common';
import type {
  LifecyclePersonalizationContext,
  LifecyclePersonalizedMessage,
  LifecycleTemplateDefinition,
} from '../types/template.types';
import type { LifecycleChannelType } from '../types/campaign.types';

@Injectable()
export class PersonalizationResolver {
  render(
    template: LifecycleTemplateDefinition,
    channel: LifecycleChannelType,
    context: LifecyclePersonalizationContext,
  ): LifecyclePersonalizedMessage {
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
      preview: template.preview
        ? this.interpolate(template.preview, variables)
        : null,
      body: this.interpolate(template.body, variables),
      ctaLabel: template.cta ? this.interpolate(template.cta, variables) : null,
      ctaUrl: context.ctaUrl,
      variablesUsed,
    };
  }

  private buildVariableMap(
    context: LifecyclePersonalizationContext,
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
      topRecommendation: context.topRecommendation ?? '',
      primaryJob: context.primaryJob ?? '',
      expectedOutcome: context.expectedOutcome ?? '',
      ctaUrl: context.ctaUrl,
      adminUrl: context.adminUrl,
      tenureDays: context.tenureDays != null ? String(context.tenureDays) : '',
      ordersLast30Days:
        context.ordersLast30Days != null
          ? String(context.ordersLast30Days)
          : '',
      nextMilestone: context.nextMilestone ?? '',
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
