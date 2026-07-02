import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ComposedPlanStep, PlanningContext } from '../types/planner.types';
import { PlannerMemoryService } from './planner-memory.service';
import { getTaskCapability } from './task-capabilities.registry';

export interface OptimizedStep extends ComposedPlanStep {
  optimizationNotes: string[];
}

@Injectable()
export class CostOptimizerService {
  constructor(
    private readonly memory: PlannerMemoryService,
    private readonly prisma: PrismaService,
  ) {}

  async optimizeSteps(
    steps: ComposedPlanStep[],
    context: PlanningContext,
  ): Promise<OptimizedStep[]> {
    const notes: string[] = [];
    const optimized: OptimizedStep[] = [];

    for (const step of steps) {
      const stepNotes: string[] = [];
      let optimizedStep: OptimizedStep = { ...step, optimizationNotes: [] };

      const memoryResult = await this.memory.lookupTaskMemory(
        step.taskKey,
        step.input,
        step.selectedModel,
      );

      if (memoryResult.canSkip) {
        optimizedStep = {
          ...optimizedStep,
          skipReason: memoryResult.skipReason,
          estimatedCostUsd: 0,
          estimatedDurationMs: 0,
          reuseFromStepId: step.stepKey,
        };
        stepNotes.push(memoryResult.skipReason ?? 'Reutilización detectada');
      }

      const cheaper = await this.findCheaperAlternative(step, context);
      if (cheaper && !optimizedStep.skipReason) {
        optimizedStep.selectedModel = cheaper.model;
        optimizedStep.estimatedCostUsd = cheaper.costUsd;
        stepNotes.push(
          `Modelo más económico: ${cheaper.model} (ahorro ~$${cheaper.savingsUsd.toFixed(4)})`,
        );
      }

      optimizedStep.optimizationNotes = stepNotes;
      optimized.push(optimizedStep);
      notes.push(...stepNotes);
    }

    return optimized;
  }

  private async findCheaperAlternative(
    step: ComposedPlanStep,
    context: PlanningContext,
  ): Promise<{ model: string; costUsd: number; savingsUsd: number } | null> {
    const cap = getTaskCapability(step.taskKey);
    if (cap.category === 'code' || cap.budgetModels.length === 0) return null;

    const remainingBudget =
      (context.budgetUsd ?? Infinity) - step.estimatedCostUsd;
    if (remainingBudget < 0 && cap.budgetModels[0]) {
      const budgetModel = cap.budgetModels[0];
      const pricing = await this.prisma.aiModelPricing.findFirst({
        where: { model: budgetModel, isActive: true },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (pricing && budgetModel !== step.selectedModel) {
        const estCost = this.estimateFromPricing(pricing, cap.estimatedCostUsd);
        return {
          model: budgetModel,
          costUsd: estCost,
          savingsUsd: Math.max(0, step.estimatedCostUsd - estCost),
        };
      }
    }

    return null;
  }

  private estimateFromPricing(
    pricing: { inputPerMillion: unknown; outputPerMillion: unknown },
    baseline: number,
  ): number {
    const input = Number(pricing.inputPerMillion);
    const output = Number(pricing.outputPerMillion);
    const ratio = (input + output) / 0.375;
    return baseline * Math.min(1, ratio);
  }
}
