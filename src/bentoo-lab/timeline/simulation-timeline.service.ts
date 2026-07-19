import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AppendTimelineEventInput {
  logicalEventId: string;
  logicalEntityKey: string;
  simulatedAt: Date;
  participantKey: string;
  domain: string;
  action: string;
  resultCode: string;
  entityType?: string;
  entityId?: string;
  correlationId: string;
  summary: string;
}

@Injectable()
export class SimulationTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async append(runId: string, input: AppendTimelineEventInput) {
    const latest = await this.prisma.simulationTimelineEvent.findFirst({
      where: { runId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    return this.prisma.simulationTimelineEvent.create({
      data: {
        runId,
        sequence: (latest?.sequence ?? 0) + 1,
        logicalEventId: input.logicalEventId,
        logicalEntityKey: input.logicalEntityKey,
        simulatedAt: input.simulatedAt,
        participantKey: input.participantKey,
        domain: input.domain,
        action: input.action,
        resultCode: input.resultCode,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId: input.correlationId,
        summary: this.sanitizeSummary(input.summary),
      },
    });
  }

  list(runId: string) {
    return this.prisma.simulationTimelineEvent.findMany({
      where: { runId },
      orderBy: { sequence: 'asc' },
    });
  }

  private sanitizeSummary(summary: string): string {
    return summary.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
}
