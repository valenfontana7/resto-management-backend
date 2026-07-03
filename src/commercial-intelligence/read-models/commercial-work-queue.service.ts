import { Injectable } from '@nestjs/common';
import {
  ExecutionPlanStatus,
  LeadAnalysisApprovalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialTodayService } from '../decisioning/commercial-today.service';
import { OpportunitySensorService } from '../sensing/opportunity-sensor.service';
import type {
  ActionIntelligenceResult,
  CommercialWorkQueueDto,
  CommercialWorkQueueItem,
  OpportunitySignal,
  WorkQueueItemKind,
  WorkQueueItemSource,
} from '../types/commercial-intelligence.types';

const ACTIONABLE_VERDICTS = new Set(['DO_NOW', 'GENERATE_DEMO', 'USE_FLASH']);

const APPROVAL_SIGNAL_TYPES = new Set([
  'PENDING_APPROVAL',
  'PLAN_AWAITING_APPROVAL',
]);

@Injectable()
export class CommercialWorkQueueService {
  private readonly dismissedIds = new Set<string>();

  constructor(
    private readonly today: CommercialTodayService,
    private readonly sensor: OpportunitySensorService,
    private readonly prisma: PrismaService,
  ) {}

  dismiss(itemId: string): void {
    this.dismissedIds.add(itemId);
  }

  async getNavCounts(): Promise<{
    workQueueActionable: number;
    pendingApprovals: number;
  }> {
    const [queue, pendingApprovals] = await Promise.all([
      this.getQueue(1),
      this.prisma.leadAnalysis.count({
        where: { approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW },
      }),
    ]);

    return {
      workQueueActionable: queue.summary.actionableCount,
      pendingApprovals,
    };
  }

  async getQueue(limit = 30): Promise<CommercialWorkQueueDto> {
    const [dashboard, signals, pendingPlans] = await Promise.all([
      this.today.getTodayDashboard(),
      this.sensor.detectAll(),
      this.loadPendingPlans(),
    ]);

    const merged = new Map<string, CommercialWorkQueueItem>();

    for (const rec of dashboard.recommended) {
      if (!rec.targetId) continue;
      const item = this.buildRecommendationItem(rec);
      merged.set(this.leadKey(rec.targetId), item);
    }

    for (const signal of signals) {
      if (signal.leadId) {
        const key = this.leadKey(signal.leadId);
        const existing = merged.get(key);
        if (existing) {
          merged.set(key, this.mergeWithSignal(existing, signal));
          continue;
        }
      }
      if (APPROVAL_SIGNAL_TYPES.has(signal.type) && signal.leadId) {
        const key = this.leadKey(signal.leadId);
        if (merged.has(key)) continue;
      }
      const standalone = this.buildSignalItem(signal);
      merged.set(standalone.id, standalone);
    }

    for (const plan of pendingPlans) {
      const key = plan.leadId
        ? this.leadKey(plan.leadId)
        : `plan:${plan.planId}`;
      const existing = merged.get(key);
      if (existing?.kind === 'plan_review') continue;
      if (existing && plan.leadId && plan.goalId && plan.planId) {
        merged.set(
          key,
          this.mergeWithPlanReview(existing, plan.goalId, plan.planId),
        );
      } else {
        merged.set(key, plan);
      }
    }

    const items = [...merged.values()]
      .filter((item) => !this.dismissedIds.has(item.id))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);

    const byKind: CommercialWorkQueueDto['summary']['byKind'] = {};
    for (const item of items) {
      byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    }

    const actionableCount = items.filter((item) =>
      item.actions.some((a) => a.mode === 'express' || a.mode === 'auto'),
    ).length;

    return {
      items,
      summary: {
        total: items.length,
        byKind,
        actionableCount,
        budgetRemainingUsd: dashboard.summary.budgetRemainingUsd,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private leadKey(leadId: string): string {
    return `lead:${leadId}`;
  }

  private buildRecommendationItem(
    rec: ActionIntelligenceResult,
  ): CommercialWorkQueueItem {
    const canAct = ACTIONABLE_VERDICTS.has(rec.verdict);
    const actions = [
      ...(canAct
        ? [
            {
              key: 'express',
              label: 'Ejecutar ahora',
              mode: 'express' as const,
            },
            {
              key: 'l1',
              label: 'Crear objetivo (L1)',
              mode: 'l1' as const,
            },
          ]
        : []),
      {
        key: 'view',
        label: 'Ver lead',
        href: `/master/leads/prospectos/${rec.targetId}`,
      },
    ];

    return {
      id: `rec:${rec.targetId}:${rec.actionType}`,
      kind: 'recommendation',
      sources: ['ev'],
      priority: rec.priority,
      leadId: rec.targetId,
      title: rec.label,
      subtitle: rec.reason,
      recommendation: rec,
      actions,
    };
  }

  private buildSignalItem(signal: OpportunitySignal): CommercialWorkQueueItem {
    const kind: WorkQueueItemKind = APPROVAL_SIGNAL_TYPES.has(signal.type)
      ? signal.type === 'PLAN_AWAITING_APPROVAL'
        ? 'plan_review'
        : 'approval'
      : 'signal';

    const actions = this.actionsForSignal(signal, kind);

    return {
      id: `sig:${signal.id}`,
      kind,
      sources: ['signal'],
      priority: signal.priority,
      leadId: signal.leadId,
      leadName: signal.leadName,
      title: signal.title,
      subtitle: signal.description,
      signal,
      actions,
    };
  }

  private mergeWithSignal(
    existing: CommercialWorkQueueItem,
    signal: OpportunitySignal,
  ): CommercialWorkQueueItem {
    const sources = [
      ...new Set<WorkQueueItemSource>([...existing.sources, 'signal']),
    ];
    const priority = Math.max(existing.priority, signal.priority);
    const kind =
      APPROVAL_SIGNAL_TYPES.has(signal.type) &&
      existing.kind !== 'recommendation'
        ? signal.type === 'PLAN_AWAITING_APPROVAL'
          ? 'plan_review'
          : 'approval'
        : existing.kind;

    return {
      ...existing,
      kind,
      sources,
      priority,
      signal,
      subtitle: `${existing.subtitle} · ${signal.description}`,
      actions: this.dedupeActions([
        ...existing.actions,
        ...this.actionsForSignal(signal, kind),
      ]),
    };
  }

  private mergeWithPlanReview(
    existing: CommercialWorkQueueItem,
    goalId: string,
    planId: string,
  ): CommercialWorkQueueItem {
    return {
      ...existing,
      kind: 'plan_review',
      sources: [...new Set<WorkQueueItemSource>([...existing.sources, 'plan'])],
      goalId,
      planId,
      actions: this.dedupeActions([
        ...existing.actions,
        {
          key: 'approve_plan',
          label: 'Aprobar plan',
          href: `/master/leads/objetivos/${goalId}`,
        },
      ]),
    };
  }

  private actionsForSignal(
    signal: OpportunitySignal,
    kind: WorkQueueItemKind,
  ): CommercialWorkQueueItem['actions'] {
    if (kind === 'approval') {
      return [
        {
          key: 'review',
          label: 'Revisar ahora',
          href: signal.actionHref ?? '/master/leads/aprobaciones',
        },
      ];
    }
    if (kind === 'plan_review') {
      return [
        {
          key: 'approve_plan',
          label: 'Aprobar plan',
          href: signal.actionHref ?? '/master/leads/objetivos',
        },
      ];
    }
    if (signal.leadId && signal.suggestedTaskKey) {
      return [
        {
          key: 'express',
          label: 'Ejecutar sugerida',
          mode: 'express',
        },
        {
          key: 'view',
          label: 'Ver lead',
          href: `/master/leads/prospectos/${signal.leadId}`,
        },
      ];
    }
    return [
      {
        key: 'view',
        label: 'Ver detalle',
        href: signal.actionHref ?? '/master/leads/hoy',
      },
    ];
  }

  private dedupeActions(
    actions: CommercialWorkQueueItem['actions'],
  ): CommercialWorkQueueItem['actions'] {
    const seen = new Set<string>();
    return actions.filter((a) => {
      const key = a.key + (a.href ?? '') + (a.mode ?? '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async loadPendingPlans(): Promise<CommercialWorkQueueItem[]> {
    const plans = await this.prisma.executionPlan.findMany({
      where: { status: ExecutionPlanStatus.PENDING_APPROVAL },
      include: {
        goal: { select: { id: true, title: true } },
        steps: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    const items: CommercialWorkQueueItem[] = [];

    for (const plan of plans) {
      const step = plan.steps[0];
      const task = step
        ? await this.prisma.aiTask.findFirst({
            where: { planStepId: step.id },
            select: { leadId: true },
          })
        : null;

      items.push({
        id: `plan:${plan.id}`,
        kind: 'plan_review',
        sources: ['plan'],
        priority: 0.82,
        leadId: task?.leadId ?? undefined,
        goalId: plan.goalId,
        planId: plan.id,
        title: `Plan pendiente — ${plan.goal.title}`,
        subtitle: 'Revisá y aprobá el plan antes de ejecutar.',
        actions: [
          {
            key: 'approve_plan',
            label: 'Aprobar plan',
            href: `/master/leads/objetivos/${plan.goalId}`,
          },
        ],
      });
    }

    const pendingAnalyses = await this.prisma.leadAnalysis.findMany({
      where: { approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW },
      include: { lead: { select: { id: true, businessName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    for (const analysis of pendingAnalyses) {
      items.push({
        id: `approval:${analysis.id}`,
        kind: 'approval',
        sources: ['approval'],
        priority: 0.75,
        leadId: analysis.leadId,
        leadName: analysis.lead.businessName,
        analysisId: analysis.id,
        title: `Mensaje por aprobar — ${analysis.lead.businessName}`,
        subtitle: 'Pendiente de revisión humana.',
        actions: [
          {
            key: 'review',
            label: 'Revisar ahora',
            href: '/master/leads/aprobaciones',
          },
        ],
      });
    }

    return items;
  }
}
