import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '@prisma/client';
import { AiProviderRouterService } from '../../ai-platform/providers/ai-provider-router.service';
import type {
  AiTaskContext,
  AiTaskHandler,
  AiTaskResult,
} from '../../ai-platform/types/ai-task.types';
import { DiscoverLeadsDto } from '../dto/discover-leads.dto';
import {
  buildScoringInputFromLead,
  calculateLeadScore,
} from '../lead-scoring.rules';
import {
  buildDiscoveryPrompt,
  buildStructureDiscoveryPrompt,
  enrichDiscoveryCandidates,
  extractGroundingSources,
  LeadDiscoveryParseError,
  parseDiscoveryResponse,
} from '../leads-discovery.helpers';
import type {
  LeadDiscoveryCandidateRaw,
  LeadDiscoveryResult,
} from '../types/lead-discovery.types';
import { LEAD_DISCOVERY_JSON_SCHEMA } from '../types/lead-discovery.types';

@Injectable()
export class DiscoverRestaurantsTask
  implements AiTaskHandler<DiscoverLeadsDto, LeadDiscoveryResult>
{
  readonly key = 'leads.discover_restaurants';
  readonly category = 'ai' as const;
  readonly requiresApproval = false;
  readonly cacheTtlSeconds = 86400;

  private readonly logger = new Logger(DiscoverRestaurantsTask.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_DISCOVERY_MODEL')?.trim() ||
      'gemini-2.5-flash'
    );
  }

  private getFinishReason(raw: unknown): string | undefined {
    return (raw as { candidates?: Array<{ finishReason?: string }> })
      ?.candidates?.[0]?.finishReason;
  }

  private async callDiscoverySearch(promptDto: DiscoverLeadsDto) {
    return this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildDiscoveryPrompt(promptDto),
      systemInstruction:
        'Sos un investigador comercial para Bentoo (SaaS restaurantes Argentina). Usa Google Search para encontrar negocios gastronomicos REALES. Respondé solo con JSON valido segun el esquema del prompt. No inventes locales. Espanol rioplatense. whyFit max 80 chars.',
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingBudget: 0,
      tools: [{ googleSearch: {} }],
    });
  }

  private async structureDiscoveryFromRaw(
    rawResearch: string,
    maxResults: number,
  ) {
    return this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildStructureDiscoveryPrompt(rawResearch, maxResults),
      systemInstruction:
        'Convertí texto de investigación comercial a JSON estricto. No inventes negocios que no estén en el texto.',
      temperature: 0.1,
      maxOutputTokens: 8192,
      thinkingBudget: 0,
      responseJsonSchema: LEAD_DISCOVERY_JSON_SCHEMA as Record<string, unknown>,
    });
  }

  async execute(
    _ctx: AiTaskContext,
    input: DiscoverLeadsDto,
  ): Promise<AiTaskResult<LeadDiscoveryResult>> {
    const maxResults = Math.min(input.maxResults ?? 10, 15);
    const promptDto = { ...input, maxResults };

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      return {
        output: {
          searchSummary: 'Gemini no está configurado',
          candidates: [],
          sources: [],
          sessionId: '',
          status: 'unavailable',
          errorCode: 'GEMINI_UNAVAILABLE',
          errorMessage:
            'Falta GEMINI_API_KEY en el servidor. Configurala e intentá de nuevo.',
        },
        confidence: 0,
      };
    }

    let response;
    try {
      // Google Search grounding no es compatible con responseJsonSchema en la misma llamada.
      // thinkingBudget:0 evita que el "thinking" de Gemini 2.5 consuma el output y trunque el JSON.
      response = await this.callDiscoverySearch(promptDto);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Discovery Gemini call failed: ${detail}`);
      return {
        output: {
          searchSummary: 'Error al consultar Gemini',
          candidates: [],
          sources: [],
          sessionId: '',
          status: 'error',
          errorCode: 'GEMINI_FAILED',
          errorMessage:
            'No pudimos completar la búsqueda con IA. Reintentá en unos segundos.',
        },
        confidence: 0,
        provider: AiProvider.GEMINI,
        model: this.defaultModel,
      };
    }

    const raw = response.text?.trim();
    if (!raw) {
      return {
        output: {
          searchSummary: 'Respuesta vacía de Gemini',
          candidates: [],
          sources: [],
          sessionId: '',
          status: 'error',
          errorCode: 'GEMINI_FAILED',
          errorMessage:
            'La IA no devolvió resultados. Reintentá con otra consulta.',
        },
        confidence: 0,
        usage: response.usage,
        provider: AiProvider.GEMINI,
        model: this.defaultModel,
      };
    }

    let parsed;
    let parseRaw = raw;
    try {
      parsed = parseDiscoveryResponse(parseRaw);
    } catch (error) {
      const finishReason = this.getFinishReason(response.raw);
      if (finishReason === 'MAX_TOKENS' && maxResults > 5) {
        this.logger.warn(
          `Discovery truncated (MAX_TOKENS), retrying with fewer results`,
        );
        try {
          const retryResponse = await this.callDiscoverySearch({
            ...promptDto,
            maxResults: Math.max(5, Math.floor(maxResults / 2)),
          });
          parseRaw = retryResponse.text?.trim() ?? parseRaw;
          parsed = parseDiscoveryResponse(parseRaw);
          response = retryResponse;
        } catch {
          /* fall through to structure pass */
        }
      }

      if (!parsed) {
        this.logger.warn(
          `Discovery JSON parse failed, attempting structure pass: ${error instanceof Error ? error.message : error}`,
        );
        try {
          const structured = await this.structureDiscoveryFromRaw(
            parseRaw,
            maxResults,
          );
          const structuredRaw = structured.text?.trim();
          if (structuredRaw) {
            parsed = parseDiscoveryResponse(structuredRaw);
            parseRaw = structuredRaw;
          }
        } catch (structureError) {
          const preview =
            error instanceof LeadDiscoveryParseError
              ? error.rawPreview
              : undefined;
          this.logger.warn(
            `Discovery structure pass failed: ${structureError instanceof Error ? structureError.message : structureError}${preview ? ` — preview: ${preview}` : ''}`,
          );
        }
      }

      if (!parsed) {
        return {
          output: {
            searchSummary: 'Error al interpretar resultados',
            candidates: [],
            sources: [],
            sessionId: '',
            status: 'error',
            errorCode: 'PARSE_FAILED',
            errorMessage:
              'La IA devolvió datos mal formateados. Reintentá la búsqueda.',
          },
          confidence: 0,
          usage: response.usage,
          provider: AiProvider.GEMINI,
          model: this.defaultModel,
        };
      }
    }
    const sources = extractGroundingSources(
      (response.raw as { candidates?: Array<{ groundingMetadata?: unknown }> })
        ?.candidates?.[0]?.groundingMetadata,
    );

    const candidates = enrichDiscoveryCandidates(
      (parsed.candidates ?? []).slice(0, maxResults),
    );

    return {
      output: {
        searchSummary: parsed.searchSummary,
        candidates,
        sources,
        sessionId: '',
        status: candidates.length > 0 ? 'success' : 'empty',
      },
      confidence: candidates.length > 0 ? 0.85 : 0.5,
      usage: response.usage,
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      suggestedActions: [
        {
          key: 'import',
          label: 'Importar candidatos seleccionados',
        },
      ],
    };
  }
}

export interface EnrichCandidateInput {
  candidate: LeadDiscoveryCandidateRaw;
}

export interface EnrichCandidateOutput {
  candidate: LeadDiscoveryCandidateRaw;
  detectedWebsite: boolean;
  detectedInstagram: boolean;
  detectedEmail: string | null;
  detectedPhone: string | null;
}

@Injectable()
export class EnrichCandidateTask
  implements AiTaskHandler<EnrichCandidateInput, EnrichCandidateOutput>
{
  readonly key = 'leads.enrich_candidate';
  readonly category = 'code' as const;
  readonly requiresApproval = false;

  async execute(
    _ctx: AiTaskContext,
    input: EnrichCandidateInput,
  ): Promise<AiTaskResult<EnrichCandidateOutput>> {
    const c = input.candidate;
    const website = c.website?.trim();
    const instagram = c.instagram?.trim();
    const whatsapp = c.whatsapp?.trim();

    const emailMatch = JSON.stringify(c).match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    );

    const phoneMatch = whatsapp?.match(/\+?\d[\d\s-]{8,}/);

    return {
      output: {
        candidate: {
          ...c,
          hasWebsite: c.hasWebsite ?? Boolean(website),
          hasWhatsapp: c.hasWhatsapp ?? Boolean(whatsapp),
        },
        detectedWebsite: Boolean(website),
        detectedInstagram: Boolean(instagram),
        detectedEmail: emailMatch?.[0] ?? null,
        detectedPhone: phoneMatch?.[0] ?? null,
      },
      confidence: 0.95,
    };
  }
}

@Injectable()
export class CalculateScoreTask
  implements
    AiTaskHandler<
      { leadId?: string; candidate?: LeadDiscoveryCandidateRaw },
      { score: number }
    >
{
  readonly key = 'leads.calculate_score';
  readonly category = 'code' as const;
  readonly requiresApproval = false;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    _ctx: AiTaskContext,
    input: { leadId?: string; candidate?: LeadDiscoveryCandidateRaw },
  ): Promise<AiTaskResult<{ score: number }>> {
    let score: number;

    if (input.leadId) {
      const lead = await this.prisma.lead.findUniqueOrThrow({
        where: { id: input.leadId },
      });
      score = calculateLeadScore(
        buildScoringInputFromLead({
          hasWebsite: lead.hasWebsite || Boolean(lead.website),
          hasOnlineMenu: lead.hasOnlineMenu,
          hasReservations: lead.hasReservations,
          hasWhatsapp: lead.hasWhatsapp || Boolean(lead.whatsapp),
          instagram: lead.instagram,
          branchCount: 1,
        }),
      );
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { score },
      });
    } else if (input.candidate) {
      const enriched = enrichDiscoveryCandidates([input.candidate]);
      score = enriched[0]?.score ?? 0;
    } else {
      throw new Error('Se requiere leadId o candidate para calcular score');
    }

    return {
      output: { score },
      confidence: 1,
    };
  }
}
