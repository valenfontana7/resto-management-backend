import { Injectable } from '@nestjs/common';
import type {
  ComposedPlanStep,
  PlanPreviewSummary,
  PlanningContext,
} from '../types/planner.types';
import { CostOptimizerService } from './cost-optimizer.service';
import { GoalStrategyRegistry } from './goal-strategies';
import { ModelSelectorService } from './model-selector.service';
import { getTaskCapability } from './task-capabilities.registry';

@Injectable()
export class PlanComposerService {
  constructor(
    private readonly strategies: GoalStrategyRegistry,
    private readonly modelSelector: ModelSelectorService,
    private readonly costOptimizer: CostOptimizerService,
  ) {}

  async compose(context: PlanningContext): Promise<{
    steps: ComposedPlanStep[];
    summary: PlanPreviewSummary;
  }> {
    const strategy = this.strategies.get(context.goalType);
    const stageTemplates = strategy.resolveStages(context);
    const discoveryInput = strategy.buildDiscoveryQuery(context);

    const stageIdMap = new Map<string, string>();
    const rawSteps: ComposedPlanStep[] = [];
    let sortOrder = 0;
    let spentEstimate = 0;

    for (const template of stageTemplates) {
      const iterations = template.scope === 'global' ? 1 : context.targetCount;

      for (let i = 0; i < iterations; i++) {
        const entityRef =
          template.scope === 'per_entity' ? `entity-${i + 1}` : undefined;
        const stepKey = entityRef
          ? `${template.stageKey}:${entityRef}`
          : template.stageKey;

        const cap = getTaskCapability(template.taskKey);
        const dependsOnStepIds = (template.dependsOnStages ?? []).map((dep) => {
          if (template.scope === 'global') return dep;
          return entityRef ? `${dep}:${entityRef}` : dep;
        });

        const input = this.buildStepInput(
          template.taskKey,
          discoveryInput,
          entityRef,
          context,
        );

        const model = await this.modelSelector.selectModel(
          template.taskKey,
          context,
          spentEstimate,
        );

        const step: ComposedPlanStep = {
          stepKey,
          taskKey: template.taskKey,
          label:
            iterations > 1 && entityRef
              ? `${template.label} (#${i + 1})`
              : template.label,
          dependsOnStepIds: dependsOnStepIds
            .map((d) => stageIdMap.get(d))
            .filter(Boolean) as string[],
          input,
          priority: context.priorities[template.taskKey] ?? sortOrder,
          entityRef,
          selectedModel: model,
          estimatedCostUsd: cap.estimatedCostUsd,
          estimatedDurationMs: cap.estimatedDurationMs,
        };

        stageIdMap.set(stepKey, stepKey);
        rawSteps.push(step);
        spentEstimate += cap.estimatedCostUsd;
        sortOrder++;
      }
    }

    const optimized = await this.costOptimizer.optimizeSteps(rawSteps, context);
    const summary = this.buildSummary(optimized, context);

    return { steps: optimized, summary };
  }

  private buildStepInput(
    taskKey: string,
    discoveryInput: Record<string, unknown>,
    entityRef: string | undefined,
    context: PlanningContext,
  ): Record<string, unknown> {
    if (taskKey === 'leads.discover_restaurants') {
      return discoveryInput;
    }
    if (entityRef) {
      return { entityRef, goalObjective: context.objective };
    }
    return { goalObjective: context.objective };
  }

  private buildSummary(
    steps: ComposedPlanStep[],
    context: PlanningContext,
  ): PlanPreviewSummary {
    const taskCounts: Record<string, number> = {};
    let estimatedCostUsd = 0;
    let estimatedDurationMs = 0;
    let skippedSteps = 0;
    let savingsUsd = 0;

    for (const step of steps) {
      taskCounts[step.taskKey] = (taskCounts[step.taskKey] ?? 0) + 1;
      estimatedCostUsd += step.estimatedCostUsd;
      estimatedDurationMs += step.estimatedDurationMs;
      if (step.skipReason) {
        skippedSteps++;
        savingsUsd += getTaskCapability(step.taskKey).estimatedCostUsd;
      }
    }

    const risks: string[] = [];
    if (context.budgetUsd && estimatedCostUsd > context.budgetUsd) {
      risks.push(
        `Costo estimado ($${estimatedCostUsd.toFixed(2)}) supera presupuesto ($${context.budgetUsd})`,
      );
    }
    if (estimatedDurationMs > 300_000) {
      risks.push('Plan puede tardar más de 5 minutos');
    }

    const confidence = Math.min(
      0.95,
      0.7 + (skippedSteps / Math.max(steps.length, 1)) * 0.2,
    );

    return {
      taskCounts,
      totalSteps: steps.length,
      activeSteps: steps.length - skippedSteps,
      skippedSteps,
      estimatedCostUsd,
      estimatedDurationMs,
      estimatedConfidence: confidence,
      savingsUsd,
      risks,
    };
  }
}
