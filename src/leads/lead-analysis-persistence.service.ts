import { Injectable } from '@nestjs/common';
import {
  LeadAnalysisApprovalStatus,
  LeadAnalysisType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadAnalysisPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  createFromTaskRun(params: {
    leadId: string;
    type: LeadAnalysisType;
    content: object;
    taskId?: string;
    executionId?: string;
    taskKey?: string;
    model?: string;
    createdById?: string;
    costUsd?: number;
    durationMs?: number;
    confidence?: number;
    approvalStatus: LeadAnalysisApprovalStatus;
  }) {
    const content = params.taskKey
      ? { ...params.content, _taskKey: params.taskKey }
      : params.content;

    return this.prisma.leadAnalysis.create({
      data: {
        leadId: params.leadId,
        type: params.type,
        content: content as Prisma.InputJsonValue,
        model: params.model ?? 'gemini',
        createdById: params.createdById,
        aiTaskId: params.taskId,
        aiExecutionId: params.executionId,
        costUsd: params.costUsd,
        durationMs: params.durationMs,
        confidence: params.confidence,
        approvalStatus: params.approvalStatus,
      },
    });
  }
}
