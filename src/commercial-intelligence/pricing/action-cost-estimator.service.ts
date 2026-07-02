import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getTaskCapability } from '../../ai-platform/planner/task-capabilities.registry';
import { PlannerMemoryService } from '../../ai-platform/planner/planner-memory.service';
import { ModelSelectionPolicyService } from '../../ai-platform/pricing/model-selection-policy.service';

export interface ActionCostEstimate {
  costUsd: number;
  durationMs: number;
  model?: string;
  modelSource?: string;
  source: 'cache' | 'historical' | 'registry' | 'pricing';
  canReuse: boolean;
  reuseSavingsUsd: number;
}

@Injectable()
export class ActionCostEstimatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: PlannerMemoryService,
    private readonly modelPolicy: ModelSelectionPolicyService,
  ) {}

  async estimate(params: {
    taskKey: string;
    input?: Record<string, unknown>;
    leadId?: string;
    budgetRemainingUsd?: number;
    recommendedModel?: string;
    preferredModel?: string;
  }): Promise<ActionCostEstimate> {
    const cap = getTaskCapability(params.taskKey);
    const input = params.input ?? {};

    const memoryResult = await this.memory.lookupTaskMemory(
      params.taskKey,
      input,
      params.recommendedModel,
    );

    if (memoryResult.canSkip) {
      const baseline = cap.estimatedCostUsd;
      return {
        costUsd: 0,
        durationMs: 0,
        source: 'cache',
        canReuse: true,
        reuseSavingsUsd: memoryResult.savedUsd ?? baseline,
      };
    }

    const modelSelection = await this.modelPolicy.select({
      taskKey: params.taskKey,
      context: 'recommendation_preview',
      budgetRemainingUsd: params.budgetRemainingUsd,
      preferredModel: params.preferredModel,
      recommendedModel: params.recommendedModel,
    });

    const historical = await this.prisma.aiTaskExecution.aggregate({
      where: {
        taskKey: params.taskKey,
        success: true,
        ...(modelSelection.model ? { model: modelSelection.model } : {}),
      },
      _avg: { totalCostUsd: true, durationMs: true },
      _count: true,
    });

    if (historical._count >= 3 && historical._avg.totalCostUsd) {
      return {
        costUsd: Number(historical._avg.totalCostUsd),
        durationMs: Math.round(
          historical._avg.durationMs ?? cap.estimatedDurationMs,
        ),
        model: modelSelection.model,
        modelSource: modelSelection.source,
        source: 'historical',
        canReuse: false,
        reuseSavingsUsd: 0,
      };
    }

    let costUsd = cap.estimatedCostUsd;
    if (modelSelection.model && cap.category === 'ai') {
      const pricing = await this.prisma.aiModelPricing.findFirst({
        where: {
          model: modelSelection.model,
          provider: AiProvider.GEMINI,
          isActive: true,
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (pricing) {
        const ratio =
          (Number(pricing.inputPerMillion) + Number(pricing.outputPerMillion)) /
          0.375;
        costUsd = cap.estimatedCostUsd * Math.min(1.5, Math.max(0.3, ratio));
      }
    }

    return {
      costUsd,
      durationMs: cap.estimatedDurationMs,
      model: modelSelection.model,
      modelSource: modelSelection.source,
      source: costUsd !== cap.estimatedCostUsd ? 'pricing' : 'registry',
      canReuse: false,
      reuseSavingsUsd: 0,
    };
  }
}
