import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getTaskCapability } from '../planner/task-capabilities.registry';

export type ModelSelectionContext =
  | 'plan_compose'
  | 'recommendation_preview'
  | 'task_execute';

export interface ModelSelectionInput {
  taskKey: string;
  context: ModelSelectionContext;
  budgetRemainingUsd?: number;
  preferredModel?: string;
  recommendedModel?: string;
}

export interface ModelSelectionResult {
  model?: string;
  source:
    | 'override'
    | 'ci_snapshot'
    | 'budget_policy'
    | 'task_default'
    | 'none';
}

@Injectable()
export class ModelSelectionPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async select(input: ModelSelectionInput): Promise<ModelSelectionResult> {
    const cap = getTaskCapability(input.taskKey);

    if (input.preferredModel) {
      return { model: input.preferredModel, source: 'override' };
    }

    if (input.recommendedModel) {
      return { model: input.recommendedModel, source: 'ci_snapshot' };
    }

    if (cap.category === 'code' || cap.preferredModels.length === 0) {
      return { source: 'none' };
    }

    const useBudgetModels =
      input.budgetRemainingUsd != null && input.budgetRemainingUsd < 0.05;

    const candidates = useBudgetModels ? cap.budgetModels : cap.preferredModels;
    if (candidates.length === 0) {
      return { model: cap.preferredModels[0], source: 'task_default' };
    }

    const ranked = await this.rankByPrice(candidates);
    return {
      model: ranked[0] ?? cap.preferredModels[0],
      source: useBudgetModels ? 'budget_policy' : 'task_default',
    };
  }

  private async rankByPrice(modelNames: string[]): Promise<string[]> {
    const pricings = await this.prisma.aiModelPricing.findMany({
      where: {
        model: { in: modelNames },
        isActive: true,
        provider: AiProvider.GEMINI,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const byModel = new Map<string, number>();
    for (const p of pricings) {
      if (!byModel.has(p.model)) {
        byModel.set(
          p.model,
          Number(p.inputPerMillion) + Number(p.outputPerMillion),
        );
      }
    }

    return [...modelNames].sort(
      (a, b) => (byModel.get(a) ?? 999) - (byModel.get(b) ?? 999),
    );
  }
}
