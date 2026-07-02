import { Injectable } from '@nestjs/common';
import type {
  GoalFilters,
  PlanStageTemplate,
  PlanningContext,
} from '../types/planner.types';

export interface GoalPlanningStrategy {
  readonly goalType: string;
  resolveStages(context: PlanningContext): PlanStageTemplate[];
  buildDiscoveryQuery(context: PlanningContext): Record<string, unknown>;
}

@Injectable()
export class AcquireLeadsStrategy implements GoalPlanningStrategy {
  readonly goalType = 'acquire_leads';

  resolveStages(context: PlanningContext): PlanStageTemplate[] {
    const stages: PlanStageTemplate[] = [
      {
        stageKey: 'discover',
        taskKey: 'leads.discover_restaurants',
        label: 'Buscar restaurantes',
        scope: 'global',
      },
      {
        stageKey: 'analyze_presence',
        taskKey: 'leads.analyze_digital_presence',
        label: 'Analizar presencia digital',
        dependsOnStages: ['discover'],
        scope: 'per_entity',
      },
      {
        stageKey: 'detect_problems',
        taskKey: 'leads.detect_problems',
        label: 'Detectar problemas',
        dependsOnStages: ['analyze_presence'],
        scope: 'per_entity',
      },
      {
        stageKey: 'diagnosis',
        taskKey: 'leads.business_diagnosis',
        label: 'Diagnóstico comercial',
        dependsOnStages: ['detect_problems'],
        scope: 'per_entity',
      },
      {
        stageKey: 'score',
        taskKey: 'leads.calculate_score',
        label: 'Calcular score',
        dependsOnStages: ['diagnosis'],
        scope: 'per_entity',
      },
    ];

    if (!context.constraints.skipDemo) {
      stages.push({
        stageKey: 'demo',
        taskKey: 'leads.generate_demo',
        label: 'Generar demo',
        dependsOnStages: ['score'],
        scope: 'per_entity',
        optional: true,
        requiresApproval: true,
      });
    }

    stages.push(
      {
        stageKey: 'message',
        taskKey: 'leads.draft_message_whatsapp',
        label: 'Redactar mensaje',
        dependsOnStages: ['score'],
        scope: 'per_entity',
        requiresApproval: true,
      },
      {
        stageKey: 'suggest',
        taskKey: 'leads.suggest_next_action',
        label: 'Sugerir próxima acción',
        dependsOnStages: ['message'],
        scope: 'per_entity',
      },
    );

    return stages;
  }

  buildDiscoveryQuery(context: PlanningContext): Record<string, unknown> {
    const f = context.filters;
    const parts: string[] = [context.objective];
    if (f.category) parts.push(`categoría ${f.category}`);
    if (f.city) parts.push(`en ${f.city}`);
    if (f.hasWebsite === false) parts.push('sin página web');
    if (f.minBranches && f.minBranches > 1)
      parts.push('con múltiples sucursales');
    if (f.premium) parts.push('restaurantes premium');

    return {
      query: parts.join(' '),
      city: f.city,
      category: f.category,
      maxResults: Math.min(context.targetCount * 2, 15),
    };
  }
}

@Injectable()
export class ReactivateLeadsStrategy implements GoalPlanningStrategy {
  readonly goalType = 'reactivate_leads';

  resolveStages(context: PlanningContext): PlanStageTemplate[] {
    void context;
    return [
      {
        stageKey: 'analyze_presence',
        taskKey: 'leads.analyze_digital_presence',
        label: 'Revisar presencia digital',
        scope: 'per_entity',
      },
      {
        stageKey: 'diagnosis',
        taskKey: 'leads.business_diagnosis',
        label: 'Re-analizar oportunidad',
        dependsOnStages: ['analyze_presence'],
        scope: 'per_entity',
      },
      {
        stageKey: 'followup',
        taskKey: 'leads.draft_followup',
        label: 'Redactar seguimiento',
        dependsOnStages: ['diagnosis'],
        scope: 'per_entity',
        requiresApproval: true,
      },
      {
        stageKey: 'suggest',
        taskKey: 'leads.suggest_next_action',
        label: 'Sugerir próxima acción',
        dependsOnStages: ['followup'],
        scope: 'per_entity',
      },
    ];
  }

  buildDiscoveryQuery(context: PlanningContext): Record<string, unknown> {
    return { query: context.objective, maxResults: context.targetCount };
  }
}

@Injectable()
export class BookMeetingsStrategy implements GoalPlanningStrategy {
  readonly goalType = 'book_meetings';

  resolveStages(context: PlanningContext): PlanStageTemplate[] {
    const acquire = new AcquireLeadsStrategy();
    const base = acquire.resolveStages(context);
    return [
      ...base,
      {
        stageKey: 'proposal',
        taskKey: 'leads.generate_proposal',
        label: 'Generar propuesta',
        dependsOnStages: ['diagnosis'],
        scope: 'per_entity',
        requiresApproval: true,
      },
    ];
  }

  buildDiscoveryQuery(context: PlanningContext): Record<string, unknown> {
    return new AcquireLeadsStrategy().buildDiscoveryQuery(context);
  }
}

@Injectable()
export class GoalStrategyRegistry {
  private readonly strategies = new Map<string, GoalPlanningStrategy>();

  constructor(
    acquire: AcquireLeadsStrategy,
    reactivate: ReactivateLeadsStrategy,
    bookMeetings: BookMeetingsStrategy,
  ) {
    for (const s of [acquire, reactivate, bookMeetings]) {
      this.strategies.set(s.goalType, s);
    }
  }

  get(goalType: string): GoalPlanningStrategy {
    return (
      this.strategies.get(goalType) ?? this.strategies.get('acquire_leads')!
    );
  }

  inferGoalType(objective: string, filters: GoalFilters): string {
    const lower = objective.toLowerCase();
    if (
      lower.includes('reactivar') ||
      lower.includes('frío') ||
      filters.coldDays
    ) {
      return 'reactivate_leads';
    }
    if (
      lower.includes('reunión') ||
      lower.includes('reunion') ||
      lower.includes('meeting')
    ) {
      return 'book_meetings';
    }
    return 'acquire_leads';
  }
}
