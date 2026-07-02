import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';
import { LeadsTaskOrchestratorService } from './leads-task-orchestrator.service';
import { DiscoverLeadsDto } from './dto/discover-leads.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import type { LeadDiscoveryResult } from './types/lead-discovery.types';

/**
 * Facade de compatibilidad sobre LeadsTaskOrchestrator + persistencia legacy.
 * @deprecated Preferir LeadsTaskOrchestratorService y AiTaskQueueService directamente.
 */
@Injectable()
export class LeadsAiService implements OnModuleInit {
  private readonly logger = new Logger(LeadsAiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly orchestrator: LeadsTaskOrchestratorService,
  ) {}

  onModuleInit(): void {
    const diagnosisModel =
      this.configService.get<string>('LEADS_AI_MODEL')?.trim() ||
      'gemini-2.5-flash-lite';
    const discoveryModel =
      this.configService.get<string>('LEADS_DISCOVERY_MODEL')?.trim() ||
      'gemini-2.5-flash';
    this.logger.log(
      `Leads AI facade — diagnosis/messages: ${diagnosisModel}, discovery: ${discoveryModel}`,
    );
  }

  analyzeBusiness(leadId: string, userId?: string) {
    return this.orchestrator.analyzeBusiness(leadId, userId);
  }

  generateMessage(
    leadId: string,
    channel: 'instagram' | 'whatsapp' | 'email',
    userId?: string,
  ) {
    return this.orchestrator.generateMessage(leadId, channel, userId);
  }

  discoverProspects(
    dto: DiscoverLeadsDto,
    userId?: string,
  ): Promise<LeadDiscoveryResult> {
    return this.orchestrator.discoverProspects(dto, userId);
  }

  importCandidates(dto: ImportLeadsDto, userId?: string) {
    return this.orchestrator.importWithAutoAnalyze(dto, userId);
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
