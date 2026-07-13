import templatesCatalogJson from './templates.v1.json';
import type {
  LifecycleTemplateCatalogDocument,
  LifecycleTemplateDefinition,
} from '../types/template.types';

const catalog = templatesCatalogJson as LifecycleTemplateCatalogDocument;

export function listTemplates(): LifecycleTemplateDefinition[] {
  return catalog.templates;
}

export function getTemplateById(
  templateId: string,
): LifecycleTemplateDefinition | null {
  return catalog.templates.find((t) => t.id === templateId) ?? null;
}
