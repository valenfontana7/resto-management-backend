import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, Lead } from '@prisma/client';
import { AiProviderRouterService } from '../ai-platform/providers/ai-provider-router.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateBundle } from '../prospect-importer/validator';
import type {
  ProspectBundle,
  ValidationResult,
} from '../prospect-importer/types';
import { parseAiJsonResponse } from './leads-ai.helpers';
import { assembleProspectBundle } from './prospect-bundle-assembler';
import {
  buildProspectBusinessStructurePrompt,
  buildProspectContentStructurePrompt,
  buildProspectMenuStructurePrompt,
  buildProspectResearchPrompt,
} from './prompts/prospect-bundle.prompts';
import {
  PROSPECT_BUSINESS_BLOCK_SCHEMA,
  PROSPECT_CONTENT_BLOCK_SCHEMA,
  PROSPECT_MENU_BLOCK_SCHEMA,
  type ProspectBusinessBlock,
  type ProspectContentBlock,
  type ProspectMenuBlock,
} from './types/prospect-bundle-ai.types';

export interface ProspectBundleGenerationResult {
  bundle: ProspectBundle;
  validation: ValidationResult;
  researchSummary: string;
  model: string;
}

@Injectable()
export class LeadProspectBundleGeneratorService {
  private readonly logger = new Logger(LeadProspectBundleGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
  ) {}

  private get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_PROSPECT_BUNDLE_MODEL')?.trim() ||
      this.configService.get<string>('LEADS_DISCOVERY_MODEL')?.trim() ||
      'gemini-2.5-flash'
    );
  }

  async generateForLead(
    leadId: string,
  ): Promise<ProspectBundleGenerationResult> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      throw new Error(
        'Gemini no está configurado (GEMINI_API_KEY). No se puede generar el paquete.',
      );
    }

    const research = await this.runResearchPass(lead);
    const businessBlock = await this.runBusinessStructurePass(lead, research);
    const menuBlock = await this.runMenuStructurePass(lead, research);
    const productIds = menuBlock.menu.products.map((p) => String(p.id));
    const contentBlock = await this.runContentStructurePass(
      lead,
      research,
      productIds,
    );

    let bundle = assembleProspectBundle({
      leadId,
      businessBlock,
      menuBlock,
      contentBlock,
    });

    let validation = validateBundle(bundle);
    if (validation.errors.length > 0) {
      this.logger.warn(
        `Bundle inicial con ${validation.errors.length} errores; aplicando reparación heurística`,
      );
      bundle = this.applyHeuristicFixes(bundle, validation.errors);
      validation = validateBundle(bundle);
    }

    return {
      bundle,
      validation,
      researchSummary: research.slice(0, 4000),
      model: this.defaultModel,
    };
  }

  private async runResearchPass(lead: Lead): Promise<string> {
    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildProspectResearchPrompt(lead),
      systemInstruction:
        'Sos un investigador comercial de Bentoo (SaaS restaurantes Argentina). Usá Google Search. Solo datos verificables. Español rioplatense.',
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingBudget: 0,
      tools: [{ googleSearch: {} }],
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('La investigación comercial no devolvió resultados.');
    }
    return text;
  }

  private async runBusinessStructurePass(lead: Lead, research: string) {
    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildProspectBusinessStructurePrompt(lead, research),
      systemInstruction:
        'Convertí investigación comercial en JSON estricto. No inventes datos no presentes en el texto.',
      temperature: 0.1,
      maxOutputTokens: 8192,
      thinkingBudget: 0,
      responseJsonSchema: PROSPECT_BUSINESS_BLOCK_SCHEMA as Record<
        string,
        unknown
      >,
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error('Estructuración de negocio vacía.');
    return parseAiJsonResponse<ProspectBusinessBlock>(raw);
  }

  private async runMenuStructurePass(lead: Lead, research: string) {
    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildProspectMenuStructurePrompt(lead, research),
      systemInstruction:
        'Extraé menú real con precios en ARS. IDs únicos kebab-case. No inventes platos.',
      temperature: 0.1,
      maxOutputTokens: 8192,
      thinkingBudget: 0,
      responseJsonSchema: PROSPECT_MENU_BLOCK_SCHEMA as Record<string, unknown>,
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error('Estructuración de menú vacía.');
    return parseAiJsonResponse<ProspectMenuBlock>(raw);
  }

  private async runContentStructurePass(
    lead: Lead,
    research: string,
    productIds: string[],
  ) {
    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildProspectContentStructurePrompt(lead, research, productIds),
      systemInstruction:
        'Generá copy comercial y SEO para demo de restaurante. Español rioplatense, concreto.',
      temperature: 0.3,
      maxOutputTokens: 8192,
      thinkingBudget: 0,
      responseJsonSchema: PROSPECT_CONTENT_BLOCK_SCHEMA as Record<
        string,
        unknown
      >,
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error('Estructuración de contenido vacía.');
    const parsed = parseAiJsonResponse<ProspectContentBlock>(raw);

    const featured = parsed.sections.featuredProducts ?? {};
    if (
      !Array.isArray(featured.productIds) ||
      featured.productIds.length === 0
    ) {
      parsed.sections.featuredProducts = {
        ...featured,
        productIds: productIds.slice(0, 4),
      };
    }

    return parsed;
  }

  private applyHeuristicFixes(
    bundle: ProspectBundle,
    errors: string[],
  ): ProspectBundle {
    const next = structuredClone(bundle);
    this.logger.debug(`Heuristic repair for: ${errors.join('; ')}`);

    const mediaIds = new Set((next.media?.images ?? []).map((m) => m.id));

    for (const product of next.menu.products) {
      if (!product.imageReference) {
        product.imageReference = `media-${product.id.replace(/^p-/, '')}`;
      }
      if (!mediaIds.has(product.imageReference)) {
        const prefix = next.prospect.id.replace(/-/g, '').slice(0, 6) || 'lead';
        next.media.images.push({
          id: product.imageReference,
          type: 'dish',
          source: 'GENERATED',
          filename: `${prefix}-${product.imageReference.replace(/^media-/, '')}.jpg`,
          alt: product.name,
          priority: 'medium',
          prompt: `Food photo: ${product.name}`,
        });
        mediaIds.add(product.imageReference);
      }
    }

    const featuredIds = next.sections.featuredProducts?.content?.productIds;
    if (Array.isArray(featuredIds)) {
      const valid = new Set(next.menu.products.map((p) => p.id));
      const filtered = featuredIds.filter((id) => valid.has(String(id)));
      next.sections.featuredProducts.content.productIds =
        filtered.length > 0
          ? filtered
          : next.menu.products.slice(0, 4).map((p) => p.id);
    }

    if (!next.business.cuisine?.length) {
      const category =
        typeof next.business.category === 'string'
          ? next.business.category.trim()
          : '';
      next.business.cuisine = category ? [category] : ['Restaurante'];
    }

    return next;
  }
}
