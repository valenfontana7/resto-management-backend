import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '@prisma/client';
import { AiProviderRouterService } from '../../ai-platform/providers/ai-provider-router.service';
import type {
  AiTaskContext,
  AiTaskHandler,
  AiTaskResult,
} from '../../ai-platform/types/ai-task.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LEAD_DIAGNOSIS_JSON_SCHEMA,
  LEAD_DEMO_OUTREACH_JSON_SCHEMA,
  LEAD_DEMO_SUMMARY_JSON_SCHEMA,
  LEAD_MESSAGE_JSON_SCHEMA,
  type LeadBusinessDiagnosis,
  type LeadDemoOutreachOutput,
  type LeadMessageContent,
} from '../types/lead-ai.types';
import {
  buildDemoOutreachPrompt,
  buildHeuristicDemoOutreach,
  normalizeDemoOutreachOutput,
  pickLeadOutreachChannel,
} from '../lead-demo-outreach';
import { parseAiJsonResponse } from '../leads-ai.helpers';
import { LeadDemoProvisionService } from '../lead-demo-provision.service';
import { LeadProspectPackageService } from '../lead-prospect-package.service';
import {
  buildDiagnosisPrompt,
  buildHeuristicDiagnosis,
  buildHeuristicMessage,
  buildMessagePrompt,
} from '../prompts/leads-ai.prompts';

@Injectable()
export class AnalyzeDigitalPresenceTask
  implements AiTaskHandler<{ leadId: string }, Record<string, boolean>>
{
  readonly key = 'leads.analyze_digital_presence';
  readonly category = 'code' as const;
  readonly requiresApproval = false;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string },
  ): Promise<AiTaskResult<Record<string, boolean>>> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
    });

    return {
      output: {
        hasWebsite: lead.hasWebsite || Boolean(lead.website),
        hasOnlineMenu: lead.hasOnlineMenu,
        hasReservations: lead.hasReservations,
        hasWhatsapp: lead.hasWhatsapp || Boolean(lead.whatsapp),
        hasInstagram: Boolean(lead.instagram),
        hasEmail: Boolean(lead.email),
      },
      confidence: 1,
      suggestedActions: [
        {
          key: 'diagnose',
          label: 'Generar diagnóstico comercial',
          taskKey: 'leads.business_diagnosis',
        },
      ],
    };
  }
}

@Injectable()
export class DetectProblemsTask
  implements AiTaskHandler<{ leadId: string }, { problems: string[] }>
{
  readonly key = 'leads.detect_problems';
  readonly category = 'code' as const;
  readonly requiresApproval = false;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string },
  ): Promise<AiTaskResult<{ problems: string[] }>> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
    });

    const problems: string[] = [];
    if (!lead.hasWebsite && !lead.website)
      problems.push('Sin sitio web propio');
    if (!lead.hasOnlineMenu) problems.push('Sin menú online');
    if (!lead.hasReservations) problems.push('Sin reservas online');
    if (!lead.hasWhatsapp && !lead.whatsapp)
      problems.push('Sin WhatsApp comercial');
    if (!lead.instagram) problems.push('Sin presencia en Instagram');

    return {
      output: { problems },
      confidence: 0.9,
    };
  }
}

@Injectable()
export class BusinessDiagnosisTask
  implements AiTaskHandler<{ leadId: string }, LeadBusinessDiagnosis>
{
  readonly key = 'leads.business_diagnosis';
  readonly category = 'ai' as const;
  readonly requiresApproval = false;
  readonly cacheTtlSeconds = 604800;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite'
    );
  }

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string },
  ): Promise<AiTaskResult<LeadBusinessDiagnosis>> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
    });

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      return {
        output: buildHeuristicDiagnosis(lead),
        confidence: 0.6,
        model: 'heuristic',
      };
    }

    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: buildDiagnosisPrompt(lead),
      systemInstruction:
        'Sos un consultor comercial de Bentoo, plataforma SaaS para restaurantes en Argentina. Devolve exclusivamente JSON valido segun el esquema, sin markdown. Usa espanol rioplatense profesional y orientado a ventas.',
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseJsonSchema: LEAD_DIAGNOSIS_JSON_SCHEMA as Record<string, unknown>,
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error('Empty Gemini response');

    return {
      output: JSON.parse(raw) as LeadBusinessDiagnosis,
      confidence: 0.85,
      usage: response.usage,
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      suggestedActions: [
        {
          key: 'message_ig',
          label: 'Redactar mensaje Instagram',
          taskKey: 'leads.draft_message_instagram',
        },
        {
          key: 'message_wa',
          label: 'Redactar mensaje WhatsApp',
          taskKey: 'leads.draft_message_whatsapp',
        },
      ],
    };
  }
}

@Injectable()
export class SuggestNextActionTask
  implements
    AiTaskHandler<
      { leadId: string; diagnosis?: LeadBusinessDiagnosis },
      { action: string; reason: string }
    >
{
  readonly key = 'leads.suggest_next_action';
  readonly category = 'ai' as const;
  readonly requiresApproval = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite'
    );
  }

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string; diagnosis?: LeadBusinessDiagnosis },
  ): Promise<AiTaskResult<{ action: string; reason: string }>> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
    });

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      const action =
        !lead.instagram && !lead.whatsapp
          ? 'Buscar canal de contacto'
          : 'Enviar primer mensaje comercial';
      return {
        output: { action, reason: 'Basado en datos disponibles del lead' },
        confidence: 0.5,
        model: 'heuristic',
      };
    }

    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: `Lead: ${lead.businessName}, status: ${lead.status}, score: ${lead.score}. Diagnóstico: ${JSON.stringify(input.diagnosis ?? {})}. Sugiere UNA próxima acción comercial concreta. JSON: {"action":"...","reason":"..."}`,
      systemInstruction: 'Respondé solo JSON válido.',
      temperature: 0.3,
      maxOutputTokens: 256,
      responseJsonSchema: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['action', 'reason'],
      },
    });

    const parsed = JSON.parse(response.text ?? '{}') as {
      action: string;
      reason: string;
    };

    return {
      output: parsed,
      confidence: 0.75,
      usage: response.usage,
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
    };
  }
}

type MessageChannel = 'instagram' | 'whatsapp' | 'email';

function resolveTaskLeadId(
  ctx: AiTaskContext,
  input: { leadId?: string },
): string {
  const leadId = input.leadId ?? ctx.leadId;
  if (!leadId) {
    throw new Error('leadId requerido para redactar el mensaje');
  }
  return leadId;
}

async function executeDraftMessage(
  prisma: PrismaService,
  configService: ConfigService,
  providerRouter: AiProviderRouterService,
  packageService: LeadProspectPackageService,
  ctx: AiTaskContext,
  input: { leadId?: string },
  channel: MessageChannel,
): Promise<AiTaskResult<LeadMessageContent>> {
  const leadId = resolveTaskLeadId(ctx, input);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const defaultModel =
    configService.get<string>('LEADS_AI_MODEL')?.trim() ||
    'gemini-2.5-flash-lite';

  const packageStatus = await packageService.getPackageStatus(leadId);
  const demoUrl = packageStatus.urls?.demo?.trim();
  const adminDemoUrl = packageStatus.urls?.demoAdmin?.trim();
  const hasDemoUrls = Boolean(demoUrl && adminDemoUrl);

  if (!providerRouter.isAvailable(AiProvider.GEMINI)) {
    if (hasDemoUrls) {
      const outreach = buildHeuristicDemoOutreach(
        lead,
        demoUrl!,
        adminDemoUrl!,
        `Demo lista para ${lead.businessName}`,
        channel,
      );
      return {
        output: {
          body: outreach.body,
          subject: outreach.subject,
          callToAction: outreach.callToAction,
        },
        confidence: 0.65,
        model: 'heuristic',
      };
    }
    return {
      output: buildHeuristicMessage(lead, channel),
      confidence: 0.6,
      model: 'heuristic',
    };
  }

  if (hasDemoUrls) {
    const response = await providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: defaultModel,
      prompt: buildDemoOutreachPrompt(lead, demoUrl!, adminDemoUrl!, channel),
      systemInstruction:
        'Sos un vendedor de Bentoo (SaaS para restaurantes). Generá mensajes comerciales personalizados con URLs de demo incluidas, en español rioplatense. Devolvé solo JSON válido según el esquema.',
      temperature: 0.5,
      maxOutputTokens: 1024,
      responseJsonSchema: LEAD_DEMO_OUTREACH_JSON_SCHEMA as Record<
        string,
        unknown
      >,
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error('Empty Gemini response');

    const parsed = normalizeDemoOutreachOutput(
      lead,
      demoUrl!,
      adminDemoUrl!,
      JSON.parse(raw) as Parameters<typeof normalizeDemoOutreachOutput>[3],
    );

    return {
      output: {
        body: parsed.body,
        subject: parsed.subject,
        callToAction: parsed.callToAction,
        demoUrl,
        adminDemoUrl,
        channel,
        summary: `Demo lista para ${lead.businessName}`,
      },
      confidence: 0.85,
      usage: response.usage,
      provider: AiProvider.GEMINI,
      model: defaultModel,
    };
  }

  const response = await providerRouter.complete({
    provider: AiProvider.GEMINI,
    model: defaultModel,
    prompt: buildMessagePrompt(lead, channel),
    systemInstruction:
      'Sos un vendedor de Bentoo (SaaS para restaurantes). Genera mensajes comerciales personalizados, cercanos y profesionales en espanol rioplatense. Devolve solo JSON valido segun el esquema.',
    temperature: 0.5,
    maxOutputTokens: 1024,
    responseJsonSchema: LEAD_MESSAGE_JSON_SCHEMA as Record<string, unknown>,
  });

  const raw = response.text?.trim();
  if (!raw) throw new Error('Empty Gemini response');

  return {
    output: JSON.parse(raw) as LeadMessageContent,
    confidence: 0.8,
    usage: response.usage,
    provider: AiProvider.GEMINI,
    model: defaultModel,
  };
}

@Injectable()
export class DraftMessageInstagramTask
  implements AiTaskHandler<{ leadId: string }, LeadMessageContent>
{
  readonly key = 'leads.draft_message_instagram';
  readonly category = 'ai' as const;
  readonly requiresApproval = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
    private readonly packageService: LeadProspectPackageService,
  ) {}

  execute(ctx: AiTaskContext, input: { leadId?: string }) {
    return executeDraftMessage(
      this.prisma,
      this.configService,
      this.providerRouter,
      this.packageService,
      ctx,
      input,
      'instagram',
    );
  }
}

@Injectable()
export class DraftMessageWhatsappTask
  implements AiTaskHandler<{ leadId: string }, LeadMessageContent>
{
  readonly key = 'leads.draft_message_whatsapp';
  readonly category = 'ai' as const;
  readonly requiresApproval = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
    private readonly packageService: LeadProspectPackageService,
  ) {}

  execute(ctx: AiTaskContext, input: { leadId?: string }) {
    return executeDraftMessage(
      this.prisma,
      this.configService,
      this.providerRouter,
      this.packageService,
      ctx,
      input,
      'whatsapp',
    );
  }
}

@Injectable()
export class DraftMessageEmailTask
  implements AiTaskHandler<{ leadId: string }, LeadMessageContent>
{
  readonly key = 'leads.draft_message_email';
  readonly category = 'ai' as const;
  readonly requiresApproval = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
    private readonly packageService: LeadProspectPackageService,
  ) {}

  execute(ctx: AiTaskContext, input: { leadId?: string }) {
    return executeDraftMessage(
      this.prisma,
      this.configService,
      this.providerRouter,
      this.packageService,
      ctx,
      input,
      'email',
    );
  }
}

@Injectable()
export class DraftFollowupTask
  implements
    AiTaskHandler<
      { leadId: string; previousMessage: string; channel: MessageChannel },
      LeadMessageContent
    >
{
  readonly key = 'leads.draft_followup';
  readonly category = 'ai' as const;
  readonly requiresApproval = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite'
    );
  }

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string; previousMessage: string; channel: MessageChannel },
  ): Promise<AiTaskResult<LeadMessageContent>> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
    });

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      return {
        output: {
          body: `Hola! Solo quería hacer un seguimiento sobre Bentoo y cómo puede ayudar a ${lead.businessName}. ¿Tuviste chance de ver mi mensaje anterior?`,
          callToAction: 'Agendar demo',
        },
        confidence: 0.5,
        model: 'heuristic',
      };
    }

    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: `Genera un seguimiento comercial para ${lead.businessName} canal ${input.channel}. Mensaje anterior: ${input.previousMessage}`,
      systemInstruction:
        'Seguimiento breve y amable. Solo JSON con body, subject opcional, callToAction.',
      temperature: 0.5,
      maxOutputTokens: 512,
      responseJsonSchema: LEAD_MESSAGE_JSON_SCHEMA as Record<string, unknown>,
    });

    return {
      output: JSON.parse(response.text ?? '{}') as LeadMessageContent,
      confidence: 0.75,
      usage: response.usage,
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
    };
  }
}

@Injectable()
export class AnalyzeClientReplyTask
  implements
    AiTaskHandler<
      { leadId: string; replyText: string },
      { sentiment: string; suggestedAction: string }
    >
{
  readonly key = 'leads.analyze_client_reply';
  readonly category = 'ai' as const;
  readonly requiresApproval = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite'
    );
  }

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string; replyText: string },
  ): Promise<AiTaskResult<{ sentiment: string; suggestedAction: string }>> {
    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      return {
        output: {
          sentiment: 'neutral',
          suggestedAction: 'Enviar seguimiento en 3 días',
        },
        confidence: 0.4,
        model: 'heuristic',
      };
    }

    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: `Analiza esta respuesta de un prospecto restaurante: "${input.replyText}". JSON: {"sentiment":"positive|neutral|negative|interested","suggestedAction":"..."}`,
      systemInstruction: 'Solo JSON válido.',
      temperature: 0.2,
      maxOutputTokens: 256,
    });

    return {
      output: JSON.parse(response.text ?? '{}') as {
        sentiment: string;
        suggestedAction: string;
      },
      confidence: 0.7,
      usage: response.usage,
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
    };
  }
}

@Injectable()
export class GenerateProposalTask
  implements AiTaskHandler<{ leadId: string }, { proposal: string }>
{
  readonly key = 'leads.generate_proposal';
  readonly category = 'ai' as const;
  readonly requiresApproval = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite'
    );
  }

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string },
  ): Promise<AiTaskResult<{ proposal: string }>> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
    });

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      return {
        output: {
          proposal: `Propuesta para ${lead.businessName}: digitalizar con Bentoo — sitio web, menú online, pedidos y reservas integrados.`,
        },
        confidence: 0.5,
        model: 'heuristic',
      };
    }

    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
      prompt: `Genera propuesta comercial breve para ${lead.businessName} (${lead.category ?? 'restaurante'}) sobre Bentoo SaaS. JSON: {"proposal":"..."}`,
      systemInstruction:
        'Propuesta profesional en español rioplatense. Solo JSON.',
      maxOutputTokens: 1024,
    });

    return {
      output: JSON.parse(response.text ?? '{"proposal":""}') as {
        proposal: string;
      },
      confidence: 0.8,
      usage: response.usage,
      provider: AiProvider.GEMINI,
      model: this.defaultModel,
    };
  }
}

@Injectable()
export class GenerateDemoTask
  implements AiTaskHandler<{ leadId: string }, LeadDemoOutreachOutput>
{
  readonly key = 'leads.generate_demo';
  readonly category = 'ai' as const;
  readonly requiresApproval = true;

  private readonly logger = new Logger(GenerateDemoTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly providerRouter: AiProviderRouterService,
    private readonly leadDemoProvision: LeadDemoProvisionService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite'
    );
  }

  async execute(
    _ctx: AiTaskContext,
    input: { leadId: string },
  ): Promise<AiTaskResult<LeadDemoOutreachOutput>> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
    });

    const { demoUrl, adminDemoUrl } =
      await this.leadDemoProvision.ensureDemoForLead(lead);
    const channel = pickLeadOutreachChannel(lead);
    const fallbackSummary = `Demo Bentoo para ${lead.businessName}: menú digital, pedidos online y reservas en una sola plataforma.`;

    if (!this.providerRouter.isAvailable(AiProvider.GEMINI)) {
      return {
        output: buildHeuristicDemoOutreach(
          lead,
          demoUrl,
          adminDemoUrl,
          fallbackSummary,
          channel,
        ),
        confidence: 0.5,
        model: 'heuristic',
      };
    }

    try {
      const response = await this.providerRouter.complete({
        provider: AiProvider.GEMINI,
        model: this.defaultModel,
        prompt: buildDemoOutreachPrompt(lead, demoUrl, adminDemoUrl, channel),
        systemInstruction:
          'Respondé solo JSON según el schema. Español rioplatense, tono comercial cercano. El body debe ser copy-paste listo para el cliente e incluir la URL de la demo.',
        maxOutputTokens: 1024,
        thinkingBudget: 0,
        responseJsonSchema: LEAD_DEMO_OUTREACH_JSON_SCHEMA as Record<
          string,
          unknown
        >,
      });

      const parsed = parseAiJsonResponse<{
        summary?: string;
        body?: string;
        subject?: string;
        callToAction?: string;
      }>(response.text ?? '{}');

      return {
        output: normalizeDemoOutreachOutput(lead, demoUrl, adminDemoUrl, {
          ...parsed,
          channel,
        }),
        confidence: 0.8,
        usage: response.usage,
        provider: AiProvider.GEMINI,
        model: this.defaultModel,
      };
    } catch (error) {
      this.logger.warn(
        `Demo outreach generation failed for ${lead.id}: ${error instanceof Error ? error.message : error}`,
      );

      try {
        const response = await this.providerRouter.complete({
          provider: AiProvider.GEMINI,
          model: this.defaultModel,
          prompt: [
            `Redactá un resumen breve (máximo 200 caracteres) para presentar la demo de Bentoo a "${lead.businessName}".`,
            lead.category ? `Rubro: ${lead.category}.` : '',
            lead.city ? `Ciudad: ${lead.city}.` : '',
            'Enfocate en digitalización, menú online y pedidos/reservas.',
          ]
            .filter(Boolean)
            .join(' '),
          systemInstruction:
            'Respondé solo JSON según el schema. Español rioplatense, tono comercial.',
          maxOutputTokens: 512,
          thinkingBudget: 0,
          responseJsonSchema: LEAD_DEMO_SUMMARY_JSON_SCHEMA as Record<
            string,
            unknown
          >,
        });

        const parsed = parseAiJsonResponse<{ summary?: string }>(
          response.text ?? '{}',
        );
        const summary = parsed.summary?.trim() || fallbackSummary;

        return {
          output: buildHeuristicDemoOutreach(
            lead,
            demoUrl,
            adminDemoUrl,
            summary,
            channel,
          ),
          confidence: 0.65,
          usage: response.usage,
          provider: AiProvider.GEMINI,
          model: this.defaultModel,
        };
      } catch (fallbackError) {
        this.logger.warn(
          `Demo summary fallback failed for ${lead.id}: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`,
        );
        return {
          output: buildHeuristicDemoOutreach(
            lead,
            demoUrl,
            adminDemoUrl,
            fallbackSummary,
            channel,
          ),
          confidence: 0.6,
          model: 'heuristic-fallback',
        };
      }
    }
  }
}
