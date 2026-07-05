import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  LifecycleTemplateCatalogDocument,
  LifecycleTemplateDefinition,
} from '../types/template.types';

let cached: LifecycleTemplateCatalogDocument | null = null;

function loadDocument(): LifecycleTemplateCatalogDocument {
  if (cached) return cached;
  const raw = readFileSync(join(__dirname, 'templates.v1.json'), 'utf-8');
  cached = JSON.parse(raw) as LifecycleTemplateCatalogDocument;
  return cached;
}

export function listTemplates(): LifecycleTemplateDefinition[] {
  return loadDocument().templates;
}

export function getTemplateById(
  templateId: string,
): LifecycleTemplateDefinition | null {
  return loadDocument().templates.find((t) => t.id === templateId) ?? null;
}
