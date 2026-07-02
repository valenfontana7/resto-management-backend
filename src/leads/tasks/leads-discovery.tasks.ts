import { Injectable } from '@nestjs/common';
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
  buildDiscoveryPrompt,
  enrichDiscoveryCandidates,
  extractGroundingSources,
  parseDiscoveryResponse,
} from '../leads-discovery.helpers';
import type {
  LeadDiscoveryCandidateRaw,
  LeadDiscoveryResult,
} from '../types/lead-discovery.types';

@Injectable()
export class DiscoverRestaurantsTask
  implements AiTaskHandler<DiscoverLeadsDto, LeadDiscoveryResult>
{
  readonly key = 'leads.discover_restaurants';
  readonly category = 'ai' as const;
  readonly requiresApproval = false;
  readonly cacheTtlSeconds = 86400;

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

  async execute(
    _ctx: AiTaskContext,
    input: DiscoverLeadsDto,
  ): Promise<AiTaskResult<LeadDiscoveryResult>> {
    const maxResults = Math.min(input.maxResults ?? 10, 15);
    const promptDto = { ...input, maxResults };

    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildDiscoveryPrompt(promptDto),
      systemInstruction:
        'Sos un investigador comercial para Bentoo (SaaS restaurantes Argentina). Usa Google Search para encontrar negocios gastronomicos REALES. Respondé solo con JSON valido segun el esquema pedido en el prompt. No inventes locales. Espanol rioplatense.',
      temperature: 0.2,
      maxOutputTokens: 4096,
      tools: [{ googleSearch: {} }],
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error('Empty Gemini discovery response');

    const parsed = parseDiscoveryResponse(raw);
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
    AiTaskHandler<{ candidate: LeadDiscoveryCandidateRaw }, { score: number }>
{
  readonly key = 'leads.calculate_score';
  readonly category = 'code' as const;
  readonly requiresApproval = false;

  async execute(
    _ctx: AiTaskContext,
    input: { candidate: LeadDiscoveryCandidateRaw },
  ): Promise<AiTaskResult<{ score: number }>> {
    const enriched = enrichDiscoveryCandidates([input.candidate]);
    return {
      output: { score: enriched[0]?.score ?? 0 },
      confidence: 1,
    };
  }
}
