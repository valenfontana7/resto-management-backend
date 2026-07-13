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
  buildProspectResearchAssessmentPrompt,
  buildProspectResearchPrompt,
} from './prompts/prospect-bundle.prompts';
import {
  buildEmptyMenuBlock,
  InsufficientResearchError,
  mergeAssessmentWithHeuristics,
  parseVerdictBlockFromResearch,
  RESEARCH_ASSESSMENT_SCHEMA,
  type ResearchAssessment,
} from './prospect-research-gate';
import {
  PROSPECT_BUSINESS_BLOCK_SCHEMA,
  PROSPECT_CONTENT_BLOCK_SCHEMA,
  PROSPECT_MENU_BLOCK_SCHEMA,
  type ProspectBusinessBlock,
  type ProspectContentBlock,
  type ProspectMenuBlock,
} from './types/prospect-bundle-ai.types';

export interface ProspectResearchResult {
  research: string;
  assessment: ResearchAssessment;
  model: string;
}

export interface ProspectBundleGenerationResult {
  bundle: ProspectBundle;
  validation: ValidationResult;
  researchSummary: string;
  assessment: ResearchAssessment;
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

  async researchForLead(leadId: string): Promise<ProspectResearchResult> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      throw new Error(
        'Gemini no está configurado (GEMINI_API_KEY). No se puede generar el paquete.',
      );
    }

    const research = await this.runResearchPass(lead);
    const assessment = await this.assessResearch(lead, research);

    if (assessment.verdict !== 'SUFICIENTE' || !assessment.identityVerified) {
      throw new InsufficientResearchError(assessment, research.slice(0, 4000));
    }

    return {
      research,
      assessment,
      model: this.defaultModel,
    };
  }

  async generateForLead(
    leadId: string,
    prefetched?: ProspectResearchResult,
  ): Promise<ProspectBundleGenerationResult> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      throw new Error(
        'Gemini no está configurado (GEMINI_API_KEY). No se puede generar el paquete.',
      );
    }

    const researchResult = prefetched ?? (await this.researchForLead(leadId));
    const { research, assessment } = researchResult;

    const generationWarnings: string[] = [];
    const businessBlock = await this.runBusinessStructurePass(lead, research);

    let menuBlock;
    if (assessment.menuSkipped || !assessment.menuVerified) {
      menuBlock = buildEmptyMenuBlock();
      generationWarnings.push(
        'Menú omitido: sin carta/precios públicos verificables. Completar a mano o reintentar con fuente de menú.',
      );
      this.logger.log(
        `Skipping menu generation for lead ${leadId} (menuSkipped=${assessment.menuSkipped})`,
      );
    } else {
      menuBlock = await this.runMenuStructurePass(lead, research);
    }

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

    if (assessment.menuSkipped || !assessment.menuVerified) {
      this.applyMenuSkippedAdjustments(bundle, generationWarnings);
    }

    let validation = validateBundle(bundle);
    if (validation.errors.length > 0) {
      this.logger.warn(
        `Bundle inicial con ${validation.errors.length} errores; aplicando reparación heurística`,
      );
      bundle = this.applyHeuristicFixes(bundle, validation.errors);
      validation = validateBundle(bundle);
    }

    validation = {
      ...validation,
      warnings: [...generationWarnings, ...validation.warnings],
    };

    return {
      bundle,
      validation,
      researchSummary: research.slice(0, 4000),
      assessment,
      model: this.defaultModel,
    };
  }

  private async runResearchPass(lead: Lead): Promise<string> {
    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildProspectResearchPrompt(lead),
      systemInstruction:
        'Sos un investigador comercial de Bentoo (SaaS restaurantes Argentina). Usá Google Search. Solo datos verificables. Si no hay evidencia, declaralo. Español rioplatense.',
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

  private async assessResearch(
    lead: Lead,
    research: string,
  ): Promise<ResearchAssessment> {
    try {
      const response = await this.providerRouter.complete({
        provider: AiProvider.GEMINI,
        model: this.defaultModel,
        prompt: buildProspectResearchAssessmentPrompt(lead, research),
        systemInstruction:
          'Evaluá evidencia comercial. Preferí INSUFICIENTE ante la duda. No inventes fuentes.',
        temperature: 0,
        maxOutputTokens: 1024,
        thinkingBudget: 0,
        responseJsonSchema: RESEARCH_ASSESSMENT_SCHEMA as Record<
          string,
          unknown
        >,
      });

      const raw = response.text?.trim();
      if (!raw) {
        throw new Error('Assessment vacío');
      }

      const parsed = parseAiJsonResponse<{
        verdict: 'SUFICIENTE' | 'INSUFICIENTE';
        reason: string;
        identityVerified: boolean;
        menuVerified: boolean;
        sourcesFound: string[];
        blockers: string[];
      }>(raw);

      return mergeAssessmentWithHeuristics(
        {
          verdict:
            parsed.verdict === 'SUFICIENTE' ? 'SUFICIENTE' : 'INSUFICIENTE',
          reason: String(parsed.reason ?? ''),
          identityVerified: Boolean(parsed.identityVerified),
          menuVerified: Boolean(parsed.menuVerified),
          sourcesFound: Array.isArray(parsed.sourcesFound)
            ? parsed.sourcesFound.map(String)
            : [],
          blockers: Array.isArray(parsed.blockers)
            ? parsed.blockers.map(String)
            : [],
        },
        research,
        lead,
      );
    } catch (error) {
      this.logger.warn(
        `Assessment JSON falló; usando veredicto del texto/heurística: ${error instanceof Error ? error.message : error}`,
      );

      const fromText = parseVerdictBlockFromResearch(research);
      return mergeAssessmentWithHeuristics(
        {
          verdict: fromText.verdict ?? 'INSUFICIENTE',
          reason:
            fromText.reason ||
            'Evaluación estructurada no disponible; se usó el veredicto de la investigación.',
          identityVerified: fromText.identityVerified ?? false,
          menuVerified: fromText.menuVerified ?? false,
          sourcesFound: [],
          blockers: ['assessment_json_fallback'],
        },
        research,
        lead,
      );
    }
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

  private applyMenuSkippedAdjustments(
    bundle: ProspectBundle,
    generationWarnings: string[],
  ): void {
    if (bundle.sections.featuredProducts) {
      bundle.sections.featuredProducts.enabled = false;
      bundle.sections.featuredProducts.reason =
        'Sin productos verificables; sección omitida hasta cargar carta.';
    }
    if (bundle.sections.menu) {
      bundle.sections.menu.content = {
        ...bundle.sections.menu.content,
        title: 'La carta',
        subtitle: 'Carta en carga — pedí por WhatsApp o consultá en el local',
      };
    }

    this.syncBuilderToEnabledSections(bundle);

    const priorWarnings = Array.isArray(bundle.metadata?.warnings)
      ? (bundle.metadata.warnings as string[])
      : [];
    bundle.metadata = {
      ...bundle.metadata,
      warnings: [...priorWarnings, ...generationWarnings],
    };
  }

  /** Quita anchors de secciones deshabilitadas del builder (order + home route). */
  private syncBuilderToEnabledSections(bundle: ProspectBundle): void {
    const enabledAnchors = new Set(
      Object.values(bundle.sections ?? {})
        .filter((s) => s.enabled)
        .map((s) => s.anchor)
        .filter(Boolean),
    );

    if (bundle.builder?.homepageSectionOrder) {
      bundle.builder.homepageSectionOrder =
        bundle.builder.homepageSectionOrder.filter((anchor) =>
          enabledAnchors.has(anchor),
        );
    }

    for (const route of bundle.builder?.routes ?? []) {
      if (!Array.isArray(route.sections)) continue;
      route.sections = route.sections.filter((anchor) =>
        enabledAnchors.has(String(anchor)),
      );
    }
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

    if (
      errors.some((e) => e.includes('homepageSectionOrder')) ||
      next.sections.featuredProducts?.enabled === false
    ) {
      this.syncBuilderToEnabledSections(next);
    }

    return next;
  }
}
