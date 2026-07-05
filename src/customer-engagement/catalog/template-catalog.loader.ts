import { readFileSync } from 'fs';
import { join } from 'path';
import type { EngagementChannelType } from '../types/channel.types';
import type { TemplateDefinition } from '../types/template.types';

interface TemplateCatalogFile {
  version: string;
  templates: Record<string, TemplateDefinition>;
}

let cached: TemplateCatalogFile | null = null;

export function loadTemplateCatalog(): TemplateCatalogFile {
  if (cached) return cached;
  const path = join(__dirname, 'templates.v1.json');
  cached = JSON.parse(readFileSync(path, 'utf-8')) as TemplateCatalogFile;
  return cached;
}

export function getTemplateById(id: string): TemplateDefinition | null {
  return loadTemplateCatalog().templates[id] ?? null;
}

export function findTemplate(input: {
  trigger?: string;
  recommendationCode?: string;
  channel?: EngagementChannelType;
}): TemplateDefinition | null {
  const templates = Object.values(loadTemplateCatalog().templates);
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
  return Object.values(loadTemplateCatalog().templates);
}
