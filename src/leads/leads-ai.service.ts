import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Lead, LeadAnalysisType, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';
import {
  LEAD_DIAGNOSIS_JSON_SCHEMA,
  LEAD_MESSAGE_JSON_SCHEMA,
  type LeadBusinessDiagnosis,
  type LeadMessageContent,
} from './types/lead-ai.types';
import { DiscoverLeadsDto } from './dto/discover-leads.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import {
  type LeadDiscoveryCandidateRaw,
  type LeadDiscoveryErrorCode,
  type LeadDiscoveryResult,
  type LeadDiscoveryStatus,
} from './types/lead-discovery.types';
import {
  buildDiscoveryPrompt,
  enrichDiscoveryCandidates,
  extractGroundingSources,
  parseDiscoveryResponse,
} from './leads-discovery.helpers';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_DISCOVERY_MODEL = 'gemini-2.5-flash';

@Injectable()
export class LeadsAiService {
  private readonly logger = new Logger(LeadsAiService.name);
  private readonly gemini: GoogleGenAI | null;
  private readonly geminiModel: string;
  private readonly discoveryModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
  ) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ||
      this.configService.get<string>('GOOGLE_API_KEY')?.trim();

    this.geminiModel =
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      DEFAULT_GEMINI_MODEL;

    this.discoveryModel =
      this.configService.get<string>('LEADS_DISCOVERY_MODEL')?.trim() ||
      DEFAULT_DISCOVERY_MODEL;

    this.gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY not configured - leads AI will use heuristic responses',
      );
    }
  }

  async analyzeBusiness(leadId: string, userId?: string) {
    const lead = await this.leadsService.findOne(leadId);
    const content = await this.generateDiagnosis(lead);
    const model = this.gemini ? this.geminiModel : 'heuristic';

    const analysis = await this.prisma.leadAnalysis.create({
      data: {
        leadId,
        type: LeadAnalysisType.BUSINESS_DIAGNOSIS,
        content: content as object,
        model,
        createdById: userId,
      },
    });

    if (lead.status === LeadStatus.NEW) {
      await this.leadsService.updateStatus(leadId, LeadStatus.ANALYZED, userId);
    }

    return analysis;
  }

  async generateMessage(
    leadId: string,
    channel: 'instagram' | 'whatsapp' | 'email',
    userId?: string,
  ) {
    const lead = await this.leadsService.findOne(leadId);
    const typeMap = {
      instagram: LeadAnalysisType.INSTAGRAM_MESSAGE,
      whatsapp: LeadAnalysisType.WHATSAPP_MESSAGE,
      email: LeadAnalysisType.EMAIL_MESSAGE,
    } as const;

    const content = await this.generateChannelMessage(lead, channel);
    const model = this.gemini ? this.geminiModel : 'heuristic';

    return this.prisma.leadAnalysis.create({
      data: {
        leadId,
        type: typeMap[channel],
        content: content as object,
        model,
        createdById: userId,
      },
    });
  }

  async getLeadAnalyses(leadId: string) {
    await this.leadsService.findOne(leadId);
    return this.prisma.leadAnalysis.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRecentDiscoveries(limit = 20) {
    return this.prisma.leadDiscoverySession.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getDiscoverySession(sessionId: string) {
    const session = await this.prisma.leadDiscoverySession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Sesión de búsqueda no encontrada');
    }
    return session;
  }

  async discoverProspects(
    dto: DiscoverLeadsDto,
    userId?: string,
  ): Promise<LeadDiscoveryResult> {
    const maxResults = Math.min(dto.maxResults ?? 10, 15);
    const filters = {
      city: dto.city,
      category: dto.category,
      maxResults,
    };

    if (!this.gemini) {
      const session = await this.prisma.leadDiscoverySession.create({
        data: {
          query: dto.query,
          filters,
          results: {
            searchSummary: 'GEMINI_API_KEY no configurada',
            candidates: [],
            sources: [],
            status: 'unavailable',
          },
          model: 'unavailable',
          createdById: userId,
        },
      });
      return {
        searchSummary:
          'Configurá GEMINI_API_KEY en el backend para habilitar búsqueda con IA.',
        candidates: [],
        sources: [],
        sessionId: session.id,
        status: 'unavailable',
        errorCode: 'GEMINI_UNAVAILABLE',
        errorMessage: 'GEMINI_API_KEY no configurada en el servidor.',
      };
    }

    const promptDto = { ...dto, maxResults };

    let parsed: {
      searchSummary: string;
      candidates: LeadDiscoveryCandidateRaw[];
    };
    let sources: string[] = [];
    let modelUsed = this.discoveryModel;
    let status: LeadDiscoveryStatus = 'success';
    let errorCode: LeadDiscoveryErrorCode | undefined;
    let errorMessage: string | undefined;

    try {
      const response = await this.gemini.models.generateContent({
        model: this.discoveryModel,
        contents: buildDiscoveryPrompt(promptDto),
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction:
            'Sos un investigador comercial para Bentoo (SaaS restaurantes Argentina). Usa Google Search para encontrar negocios gastronomicos REALES. Respondé solo con JSON valido segun el esquema pedido en el prompt. No inventes locales. Espanol rioplatense.',
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error('Empty Gemini discovery response');

      try {
        parsed = parseDiscoveryResponse(raw);
      } catch (parseError) {
        const message =
          parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`PARSE_FAILED: ${message}`);
      }

      sources = extractGroundingSources(
        response.candidates?.[0]?.groundingMetadata,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Gemini discovery failed: ${message}`);

      const isParseError = message.startsWith('PARSE_FAILED:');
      status = 'error';
      errorCode = isParseError ? 'PARSE_FAILED' : 'GEMINI_FAILED';
      errorMessage = isParseError
        ? 'No se pudo interpretar la respuesta de la IA. Probá con otra consulta.'
        : 'No se pudo completar la búsqueda. Intentá con otra consulta o menos filtros.';
      modelUsed = 'error';
      parsed = {
        searchSummary: errorMessage,
        candidates: [],
      };
    }

    const candidates = enrichDiscoveryCandidates(
      (parsed.candidates ?? []).slice(0, maxResults),
    );

    if (status !== 'error') {
      status = candidates.length > 0 ? 'success' : 'empty';
    }

    const session = await this.prisma.leadDiscoverySession.create({
      data: {
        query: dto.query,
        filters,
        results: {
          searchSummary: parsed.searchSummary,
          candidates,
          sources,
          status,
          errorCode,
          errorMessage,
        } as unknown as Prisma.InputJsonValue,
        model: modelUsed,
        createdById: userId,
      },
    });

    return {
      searchSummary: parsed.searchSummary,
      candidates,
      sources,
      sessionId: session.id,
      status,
      errorCode,
      errorMessage,
    };
  }

  async importCandidates(dto: ImportLeadsDto, userId?: string) {
    const enriched = dto.candidates.map((candidate) => ({
      ...candidate,
      discoveredWithAi: candidate.discoveredWithAi ?? true,
      discoverySessionId:
        candidate.discoverySessionId ?? dto.discoverySessionId ?? undefined,
    }));

    const result = await this.leadsService.importCandidates(enriched, userId);

    if (dto.autoAnalyze && result.created.length > 0) {
      for (const lead of result.created as Lead[]) {
        try {
          await this.analyzeBusiness(lead.id, userId);
        } catch (error) {
          this.logger.warn(`Auto-analyze failed for lead ${lead.id}: ${error}`);
        }
      }
    }

    return result;
  }

  async getRecentAnalyses(limit = 30) {
    return this.prisma.leadAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            category: true,
            city: true,
          },
        },
      },
    });
  }

  private async generateDiagnosis(lead: Lead): Promise<LeadBusinessDiagnosis> {
    const fallback = this.buildHeuristicDiagnosis(lead);

    if (!this.gemini) return fallback;

    try {
      const response = await this.gemini.models.generateContent({
        model: this.geminiModel,
        contents: this.buildDiagnosisPrompt(lead),
        config: {
          systemInstruction:
            'Sos un consultor comercial de Bentoo, plataforma SaaS para restaurantes en Argentina. Devolve exclusivamente JSON valido segun el esquema, sin markdown. Usa espanol rioplatense profesional y orientado a ventas.',
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseJsonSchema: LEAD_DIAGNOSIS_JSON_SCHEMA,
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error('Empty Gemini response');

      return JSON.parse(raw) as LeadBusinessDiagnosis;
    } catch (error) {
      this.logger.warn(`Gemini diagnosis failed: ${error}`);
      return fallback;
    }
  }

  private async generateChannelMessage(
    lead: Lead,
    channel: 'instagram' | 'whatsapp' | 'email',
  ): Promise<LeadMessageContent> {
    const fallback = this.buildHeuristicMessage(lead, channel);

    if (!this.gemini) return fallback;

    try {
      const response = await this.gemini.models.generateContent({
        model: this.geminiModel,
        contents: this.buildMessagePrompt(lead, channel),
        config: {
          systemInstruction:
            'Sos un vendedor de Bentoo (SaaS para restaurantes). Genera mensajes comerciales personalizados, cercanos y profesionales en espanol rioplatense. Devolve solo JSON valido segun el esquema.',
          temperature: 0.5,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseJsonSchema: LEAD_MESSAGE_JSON_SCHEMA,
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error('Empty Gemini response');

      return JSON.parse(raw) as LeadMessageContent;
    } catch (error) {
      this.logger.warn(`Gemini message failed: ${error}`);
      return fallback;
    }
  }

  private buildDiagnosisPrompt(lead: Lead): string {
    return `Analiza este prospecto comercial para Bentoo:

Negocio: ${lead.businessName}
Categoria: ${lead.category ?? 'No especificada'}
Ciudad: ${lead.city ?? 'No especificada'}
Contacto: ${lead.contactName ?? 'No especificado'}
Sitio web: ${lead.website ?? 'No tiene'}
Instagram: ${lead.instagram ?? 'No tiene'}
WhatsApp: ${lead.whatsapp ?? 'No tiene'}

Capacidades digitales actuales:
- Tiene sitio web: ${lead.hasWebsite ? 'Si' : 'No'}
- Menu online: ${lead.hasOnlineMenu ? 'Si' : 'No'}
- Reservas online: ${lead.hasReservations ? 'Si' : 'No'}
- WhatsApp comercial: ${lead.hasWhatsapp ? 'Si' : 'No'}
- Ecommerce: ${lead.hasEcommerce ? 'Si' : 'No'}
- Sucursales: ${lead.branchCount}
- Score comercial Bentoo: ${lead.score}/100

Notas: ${lead.notes ?? 'Sin notas'}

Genera un diagnostico comercial, oportunidades, beneficios de Bentoo, objeciones probables y argumentos de venta.`;
  }

  private buildMessagePrompt(
    lead: Lead,
    channel: 'instagram' | 'whatsapp' | 'email',
  ): string {
    const channelGuide = {
      instagram:
        'Mensaje corto para DM de Instagram (max 500 caracteres en body). Tono casual pero profesional.',
      whatsapp:
        'Mensaje para WhatsApp (max 800 caracteres). Tono conversacional, con saludo personalizado.',
      email:
        'Email comercial formal pero cercano. Inclui subject y body. Menciona beneficios concretos de Bentoo.',
    };

    return `Genera un mensaje comercial para canal ${channel}.
${channelGuide[channel]}

Prospecto:
- Negocio: ${lead.businessName}
- Categoria: ${lead.category ?? 'restaurante'}
- Ciudad: ${lead.city ?? 'Argentina'}
- Contacto: ${lead.contactName ?? 'equipo del local'}
- Sin sitio web: ${!lead.hasWebsite}
- Sin menu online: ${!lead.hasOnlineMenu}
- Sin reservas online: ${!lead.hasReservations}

Bentoo ofrece: sitio web propio, menu digital, pedidos online, reservas, delivery, cobros con MercadoPago, panel de gestion.`;
  }

  private buildHeuristicDiagnosis(lead: Lead): LeadBusinessDiagnosis {
    const gaps: string[] = [];
    if (!lead.hasWebsite) gaps.push('sitio web propio');
    if (!lead.hasOnlineMenu) gaps.push('menu digital con pedidos');
    if (!lead.hasReservations) gaps.push('reservas online');
    if (!lead.hasWhatsapp) gaps.push('canal WhatsApp integrado');

    const diagnosis =
      gaps.length > 0
        ? `${lead.businessName} tiene oportunidades claras de digitalizacion: le faltan ${gaps.join(', ')}.`
        : `${lead.businessName} ya tiene presencia digital basica, pero puede optimizar operacion y conversion con Bentoo.`;

    return {
      diagnosis,
      opportunities: [
        !lead.hasWebsite && 'Crear sitio web profesional con marca propia',
        !lead.hasOnlineMenu && 'Habilitar menu online con pedidos directos',
        !lead.hasReservations && 'Agregar reservas online sin comisiones',
        lead.branchCount > 1 && 'Gestion centralizada multi-sucursal',
      ].filter(Boolean) as string[],
      bentooBenefits: [
        'Sitio web y menu digital en minutos, sin desarrolladores',
        'Pedidos, reservas y delivery en una sola plataforma',
        'Cobros online con la cuenta MercadoPago del restaurante',
        'Panel de gestion para cocina, mesas y analytics',
      ],
      probableObjections: [
        'Ya uso otra plataforma o redes sociales para pedidos',
        'No tengo tiempo para implementar algo nuevo',
        'Los clientes prefieren llamar o ir al local',
        'El costo mensual no se justifica todavia',
      ],
      salesArguments: [
        'Prueba gratuita para validar con pedidos reales',
        'Sin comision por pedido: el restaurante cobra directo',
        'Setup asistido en menos de una hora',
        'Aumenta ticket promedio con upselling en menu digital',
      ],
    };
  }

  private buildHeuristicMessage(
    lead: Lead,
    channel: 'instagram' | 'whatsapp' | 'email',
  ): LeadMessageContent {
    const name = lead.contactName ?? 'equipo de ' + lead.businessName;
    const hook = !lead.hasWebsite
      ? 'vi que todavia no tienen sitio web propio'
      : !lead.hasOnlineMenu
        ? 'note que no tienen menu online con pedidos'
        : 'creo que Bentoo puede ayudarlos a vender mas online';

    const body =
      channel === 'instagram'
        ? `Hola ${name}! Soy de Bentoo. ${hook}. Ayudamos restaurantes como ${lead.businessName} a tener web, menu digital y pedidos online. Te interesa que te cuente mas?`
        : channel === 'whatsapp'
          ? `Hola ${name}, como estas? Te escribo de Bentoo. ${hook}. Trabajamos con restaurantes en ${lead.city ?? 'Argentina'} para digitalizar pedidos y reservas sin comisiones. Podemos charlar 10 minutos esta semana?`
          : `Hola ${name},\n\nTe contacto desde Bentoo porque ${hook}.\n\nBentoo es la plataforma que usan restaurantes para tener su propio sitio, menu digital, pedidos online y reservas, todo integrado.\n\nMe gustaria mostrarte como ${lead.businessName} podria empezar en menos de una hora.\n\nSaludos!`;

    return {
      subject:
        channel === 'email'
          ? `Propuesta para digitalizar ${lead.businessName}`
          : undefined,
      body,
      callToAction: 'Agendar una demo de 15 minutos',
    };
  }
}
