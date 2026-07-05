import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getTemplateById } from '../catalog/template-catalog.loader';
import type { LifecycleTemplateDefinition } from '../types/template.types';

export interface EffectiveTemplate extends LifecycleTemplateDefinition {
  hasOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

@Injectable()
export class TemplateOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveTemplate(
    templateId: string,
  ): Promise<EffectiveTemplate | null> {
    const base = getTemplateById(templateId);
    if (!base) return null;

    const override = await this.prisma.lifecycleTemplateOverride.findUnique({
      where: { templateId },
    });

    if (!override) {
      return {
        ...base,
        hasOverride: false,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      ...base,
      subject: override.subject ?? base.subject,
      preview: override.preview ?? base.preview,
      body: override.body ?? base.body,
      cta: override.cta ?? base.cta,
      tone: override.tone ?? base.tone,
      locale: override.locale ?? base.locale,
      version: override.version,
      hasOverride: true,
      updatedAt: override.updatedAt.toISOString(),
      updatedBy: override.updatedBy,
    };
  }

  resolveEffectiveSync(
    templateId: string,
    override: Awaited<
      ReturnType<PrismaService['lifecycleTemplateOverride']['findUnique']>
    >,
  ): LifecycleTemplateDefinition | null {
    const base = getTemplateById(templateId);
    if (!base) return null;
    if (!override) return base;

    return {
      ...base,
      subject: override.subject ?? base.subject,
      preview: override.preview ?? base.preview,
      body: override.body ?? base.body,
      cta: override.cta ?? base.cta,
      tone: override.tone ?? base.tone,
      locale: override.locale ?? base.locale,
      version: override.version,
    };
  }

  async upsertOverride(
    templateId: string,
    input: {
      subject?: string;
      preview?: string;
      body?: string;
      cta?: string;
      tone?: string;
      updatedBy?: string;
    },
  ): Promise<EffectiveTemplate> {
    const base = getTemplateById(templateId);
    if (!base) {
      throw new NotFoundException(
        `Template ${templateId} not found in catalog`,
      );
    }

    const bumpVersion = (current: string): string => {
      const parts = current.split('.');
      const patch = Number(parts[2] ?? 0) + 1;
      return `${parts[0] ?? '1'}.${parts[1] ?? '0'}.${patch}`;
    };

    const existing = await this.prisma.lifecycleTemplateOverride.findUnique({
      where: { templateId },
    });

    const nextVersion = bumpVersion(existing?.version ?? base.version);

    await this.prisma.lifecycleTemplateOverride.upsert({
      where: { templateId },
      create: {
        templateId,
        subject: input.subject,
        preview: input.preview,
        body: input.body,
        cta: input.cta,
        tone: input.tone ?? base.tone,
        locale: base.locale,
        version: nextVersion,
        updatedBy: input.updatedBy ?? null,
      },
      update: {
        subject: input.subject,
        preview: input.preview,
        body: input.body,
        cta: input.cta,
        tone: input.tone,
        version: nextVersion,
        updatedBy: input.updatedBy ?? null,
      },
    });

    const effective = await this.getEffectiveTemplate(templateId);
    return effective!;
  }
}
