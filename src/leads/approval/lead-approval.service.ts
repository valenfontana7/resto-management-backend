import { Injectable, NotFoundException } from '@nestjs/common';
import {
  LeadAnalysisApprovalStatus,
  LeadAnalysisType,
  LeadStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LeadApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async approve(analysisId: string, userId: string) {
    await this.ensureAnalysis(analysisId);
    return this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: {
        approvalStatus: LeadAnalysisApprovalStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
  }

  async reject(analysisId: string, userId: string) {
    await this.ensureAnalysis(analysisId);
    return this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: {
        approvalStatus: LeadAnalysisApprovalStatus.REJECTED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
  }

  async markSent(analysisId: string, userId: string) {
    void userId;
    const analysis = await this.ensureAnalysis(analysisId);
    if (analysis.approvalStatus !== LeadAnalysisApprovalStatus.APPROVED) {
      throw new Error(
        'El mensaje debe estar aprobado antes de marcar como enviado',
      );
    }

    const updated = await this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: {
        approvalStatus: LeadAnalysisApprovalStatus.SENT,
        sentAt: new Date(),
      },
    });

    if (analysis.lead.status === LeadStatus.ANALYZED) {
      await this.prisma.lead.update({
        where: { id: analysis.leadId },
        data: { status: LeadStatus.CONTACTED },
      });
    }

    return updated;
  }

  async listPending(limit = 50) {
    return this.prisma.leadAnalysis.findMany({
      where: {
        approvalStatus: {
          in: [
            LeadAnalysisApprovalStatus.DRAFT,
            LeadAnalysisApprovalStatus.PENDING_REVIEW,
          ],
        },
        type: {
          in: [
            LeadAnalysisType.INSTAGRAM_MESSAGE,
            LeadAnalysisType.WHATSAPP_MESSAGE,
            LeadAnalysisType.EMAIL_MESSAGE,
          ],
        },
      },
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
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async ensureAnalysis(analysisId: string) {
    const analysis = await this.prisma.leadAnalysis.findUnique({
      where: { id: analysisId },
      include: { lead: true },
    });
    if (!analysis) throw new NotFoundException('Análisis no encontrado');
    return analysis;
  }
}
