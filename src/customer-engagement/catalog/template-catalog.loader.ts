import templatesCatalogJson from './templates.v1.json';
import type { EngagementChannelType } from '../types/channel.types';
import type { TemplateDefinition } from '../types/template.types';

interface TemplateCatalogFile {
  version: string;
  templates: Record<string, TemplateDefinition>;
}

const catalog = templatesCatalogJson as TemplateCatalogFile;

export function loadTemplateCatalog(): TemplateCatalogFile {
  return catalog;
}

export function getTemplateById(id: string): TemplateDefinition | null {
  return catalog.templates[id] ?? null;
}

export function findTemplate(input: {
  trigger?: string;
  recommendationCode?: string;
  channel?: EngagementChannelType;
}): TemplateDefinition | null {
  const templates = Object.values(catalog.templates);
  return (
    templates.find((t) => {
      if (input.trigger && t.trigger !== input.trigger) return false;
      if (
        input.recommendationCode &&
        !t.linkedRecommendationCodes.includes(input.recommendationCode)
      ) {
        return false;
      }
      if (input.channel && !t.supportedChannels.includes(input.channel)) {
        return false;
      }
      return true;
    }) ?? null
  );
}

export function listTemplates(): TemplateDefinition[] {
  return Object.values(catalog.templates);
}
