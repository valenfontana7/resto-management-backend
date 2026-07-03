import { BadRequestException, Injectable } from '@nestjs/common';
import { GoalEngineService } from '../../ai-platform/goal-engine/goal-engine.service';
import { AiPlannerService } from '../../ai-platform/planner/ai-planner.service';
import { PlanExecutorService } from '../../ai-platform/planner/plan-executor.service';
import { CommercialAutonomyService } from './commercial-autonomy.service';
import { CommercialDecisionService } from './commercial-today.service';
import type {
  ActionIntelligenceResult,
  CommercialActionMode,
  CommercialAutonomyLevel,
} from '../types/commercial-intelligence.types';

export interface ActOnRecommendationResult {
  decision: { id: string };
  goal?: { id: string };
  plan?: { id: string };
  message: string;
  autonomyLevel: CommercialAutonomyLevel;
  l2BlockedReasons?: string[];
}

@Injectable()
export class CommercialActionOrchestratorService {
  constructor(
    private readonly decisions: CommercialDecisionService,
    private readonly goalEngine: GoalEngineService,
    private readonly planner: AiPlannerService,
    private readonly planExecutor: PlanExecutorService,
    private readonly autonomy: CommercialAutonomyService,
  ) {}

  async act(
    recommendation: ActionIntelligenceResult,
    mode: CommercialActionMode,
    userId?: string,
  ): Promise<ActOnRecommendationResult> {
    if (mode === 'record') {
      const decision = await this.decisions.recordAccepted(
        recommendation,
        userId,
        undefined,
        'RECOMMEND',
      );
      return {
        decision: { id: decision.id },
        message: 'Decisión registrada',
        autonomyLevel: 'RECOMMEND',
      };
    }

    if (!recommendation.targetId) {
      throw new BadRequestException('La recomendación no tiene lead asociado');
    }

    let effectiveMode = mode;
    let l2BlockedReasons: string[] | undefined;

    if (mode === 'auto') {
      const l2 = await this.autonomy.evaluateL2Eligibility(recommendation);
      if (!l2.eligible) {
        effectiveMode = 'express';
        l2BlockedReasons = l2.reasons;
      }
    }

    const autonomyLevel: CommercialAutonomyLevel =
      effectiveMode === 'auto'
        ? 'AUTO_EXECUTE'
        : effectiveMode === 'express'
          ? 'EXPRESS'
          : 'SUGGEST_GOAL';

    const goal = await this.goalEngine.create(
      {
        title: recommendation.label.slice(0, 80),
        objective: `Acción comercial: ${recommendation.label}. ${recommendation.reason}`,
        targetCount: 1,
        budgetUsd: Math.max(recommendation.estimatedCostUsd * 3, 1),
      },
      userId,
    );

    const plan = await this.planner.buildPlan(goal.id, userId);

    const decision = await this.decisions.recordAccepted(
      recommendation,
      userId,
      goal.id,
      autonomyLevel,
      effectiveMode === 'express' || effectiveMode === 'auto'
        ? plan.id
        : undefined,
    );

    if (effectiveMode === 'l1') {
      return {
        decision: { id: decision.id },
        goal: { id: goal.id },
        plan: { id: plan.id },
        message: 'Objetivo y plan creados (L1 — revisar y aprobar)',
        autonomyLevel: 'SUGGEST_GOAL',
        l2BlockedReasons,
      };
    }

    await this.planner.approvePlan(plan.id, userId);
    await this.planExecutor.startPlan(plan.id);

    const autoNote =
      effectiveMode === 'auto'
        ? ' (L2 auto-ejecutado)'
        : l2BlockedReasons?.length
          ? ' (L2 no elegible — ejecutado en modo express)'
          : '';

    return {
      decision: { id: decision.id },
      goal: { id: goal.id },
      plan: { id: plan.id },
      message: `Plan aprobado y en ejecución${autoNote}`,
      autonomyLevel,
      l2BlockedReasons,
    };
  }

  async actBatch(
    recommendations: ActionIntelligenceResult[],
    mode: 'express' | 'auto',
    userId?: string,
    maxItems = 5,
  ): Promise<{
    results: ActOnRecommendationResult[];
    succeeded: number;
    failed: number;
  }> {
    const slice = recommendations.slice(0, maxItems);
    const results: ActOnRecommendationResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const rec of slice) {
      try {
        const result = await this.act(rec, mode, userId);
        results.push(result);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }

    return { results, succeeded, failed };
  }
}
