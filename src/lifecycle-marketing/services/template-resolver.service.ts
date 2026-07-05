import { Injectable } from '@nestjs/common';
import {
  getTemplateById,
  listTemplates,
} from '../catalog/template-catalog.loader';
import { TemplateOverrideService } from './template-override.service';
import type { LifecycleTemplateDefinition } from '../types/template.types';

@Injectable()
export class TemplateResolver {
  constructor(private readonly overrides: TemplateOverrideService) {}

  listTemplates(): LifecycleTemplateDefinition[] {
    return listTemplates();
  }

  async resolve(
    templateId: string,
  ): Promise<LifecycleTemplateDefinition | null> {
    const effective = await this.overrides.getEffectiveTemplate(templateId);
    if (!effective) return null;
    const { hasOverride, updatedAt, updatedBy, ...template } = effective;
    void hasOverride;
    void updatedAt;
    void updatedBy;
    return template;
  }

  resolveSyncFromCatalog(
    templateId: string,
  ): LifecycleTemplateDefinition | null {
    return getTemplateById(templateId);
  }

  async resolveForStep(
    templateId: string,
    _channel: string,
  ): Promise<LifecycleTemplateDefinition | null> {
    void _channel;
    return this.resolve(templateId);
  }
}
