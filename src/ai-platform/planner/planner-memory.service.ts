import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiMemoryService } from '../memory/ai-memory.service';
import { getTaskCapability } from './task-capabilities.registry';

export interface MemoryLookupResult {
  canSkip: boolean;
  skipReason?: string;
  reuseOutput?: unknown;
  savedUsd?: number;
  lastExecutedAt?: Date;
}

@Injectable()
export class PlannerMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AiMemoryService,
  ) {}

  async lookupTaskMemory(
    taskKey: string,
    input: Record<string, unknown>,
    model?: string,
    maxAgeDays = 7,
  ): Promise<MemoryLookupResult> {
    const cap = getTaskCapability(taskKey);
    const entityRef = this.extractEntityRef(input);

    if (entityRef) {
      const since = new Date();
      since.setDate(since.getDate() - maxAgeDays);

      const recent = await this.prisma.aiTaskExecution.findFirst({
        where: {
          taskKey,
          success: true,
          executedAt: { gte: since },
          OR: [
            { leadId: entityRef },
            { leadId: input.leadId as string | undefined },
          ],
        },
        orderBy: { executedAt: 'desc' },
      });

      if (recent) {
        return {
          canSkip: true,
          skipReason: `Reutilizado: ejecutado hace ${this.daysAgo(recent.executedAt)} días`,
          savedUsd: Number(recent.totalCostUsd),
          lastExecutedAt: recent.executedAt,
        };
      }
    }

    if (cap.cacheTtlSeconds) {
      const key = this.cache.buildKey(taskKey, input, model);
      const cached = await this.cache.get(key);
      if (cached) {
        return {
          canSkip: true,
          skipReason: 'Cache hit',
          reuseOutput: cached.output,
          savedUsd: cap.estimatedCostUsd,
        };
      }
    }

    return { canSkip: false };
  }

  private extractEntityRef(input: Record<string, unknown>): string | undefined {
    if (typeof input.leadId === 'string') return input.leadId;
    if (typeof input.entityRef === 'string') return input.entityRef;
    return undefined;
  }

  private daysAgo(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / (86400 * 1000));
  }
}
