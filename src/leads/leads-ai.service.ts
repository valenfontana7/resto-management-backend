import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoverLeadsDto } from './dto/discover-leads.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { PatchDiscoveryCandidateDto } from './dto/patch-discovery-candidate.dto';
import { LeadsAiExecutionService } from './leads-ai-execution.service';
import { LeadsService } from './leads.service';
import { mergeDiscoveryCandidatePatch } from './leads-discovery.helpers';
import type { LeadDiscoveryResult } from './types/lead-discovery.types';

/**
 * Fachada HTTP para operaciones IA de leads (prospección, análisis, mensajes).
 * Delega en LeadsAiExecutionService (Execution Platform).
 */
@Injectable()
export class LeadsAiService implements OnModuleInit {
  private readonly logger = new Logger(LeadsAiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly execution: LeadsAiExecutionService,
  ) {}

  onModuleInit(): void {
    const diagnosisModel =
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite';
    const discoveryModel =
      this.configService.get<string>('LEADS_DISCOVERY_MODEL')?.trim() ||
      'gemini-2.5-flash';
    this.logger.log(
      `Leads AI — diagnosis/messages: ${diagnosisModel}, discovery: ${discoveryModel}`,
    );
  }

  analyzeBusiness(leadId: string, userId?: string) {
    return this.execution.analyzeBusiness(leadId, userId);
  }

  generateMessage(
    leadId: string,
    channel: 'instagram' | 'whatsapp' | 'email',
    userId?: string,
  ) {
    return this.execution.generateMessage(leadId, channel, userId);
  }

  discoverProspects(
    dto: DiscoverLeadsDto,
    userId?: string,
  ): Promise<LeadDiscoveryResult> {
    return this.execution.discoverProspects(dto, userId);
  }

  importCandidates(
    dto: ImportLeadsDto,
    userId?: string,
    postProcessMode: 'off' | 'suggest' | 'auto' = 'suggest',
  ) {
    return this.execution.importWithAutoAnalyze(dto, userId, postProcessMode);
  }

  generateProspectPackage(
    leadId: string,
    userId?: string,
    options?: { wait?: boolean; autoImport?: boolean },
  ) {
    return this.execution.generateProspectPackage(leadId, userId, options);
  }

  getProspectPackageGeneration(taskId: string, leadId: string) {
    return this.execution.getProspectPackageGeneration(taskId, leadId);
  }

  runProspectPipeline(
    leadId: string,
    userId?: string,
    options?: {
      skipImport?: boolean;
      skipImages?: boolean;
      skipSalesPackage?: boolean;
    },
  ) {
    return this.execution.runProspectPipeline(leadId, userId, options);
  }

  getProspectPipeline(leadId: string) {
    return this.execution.getProspectPipeline(leadId);
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

  async patchDiscoveryCandidate(
    sessionId: string,
    candidateId: string,
    patch: PatchDiscoveryCandidateDto,
  ) {
    const session = await this.getDiscoverySession(sessionId);
    const results = session.results as unknown as LeadDiscoveryResult;
    const candidates = results.candidates ?? [];
    const index = candidates.findIndex((c) => c.id === candidateId);
    if (index < 0) {
      throw new NotFoundException('Candidato no encontrado en la sesión');
    }

    const updated = mergeDiscoveryCandidatePatch(candidates[index], patch);
    const nextCandidates = [...candidates];
    nextCandidates[index] = updated;

    const nextResults = {
      ...results,
      candidates: nextCandidates,
    };

    await this.prisma.leadDiscoverySession.update({
      where: { id: sessionId },
      data: { results: nextResults as unknown as Prisma.InputJsonValue },
    });

    return updated;
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
}
