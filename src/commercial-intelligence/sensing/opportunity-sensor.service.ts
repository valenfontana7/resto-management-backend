import { Injectable } from '@nestjs/common';
import {
  LeadAnalysisApprovalStatus,
  LeadStatus,
  PlanStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  OpportunitySignal,
  OpportunitySignalSeverity,
  OpportunitySignalType,
} from '../types/commercial-intelligence.types';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OpportunitySensorService {
  constructor(private readonly prisma: PrismaService) {}

  async detectAll(): Promise<OpportunitySignal[]> {
    const now = Date.now();
    const [
      staleFollowups,
      coolingHighIntent,
      hotNewLeads,
      pendingApprovals,
      planAwaitingApproval,
      recentDemoViews,
      demoCandidates,
      budgetLow,
    ] = await Promise.all([
      this.detectStaleFollowups(now),
      this.detectCoolingHighIntent(now),
      this.detectHotNewLeads(now),
      this.detectPendingApprovals(now),
      this.detectPlanAwaitingApproval(now),
      this.detectRecentDemoViews(now),
      this.detectDemoCandidates(now),
      this.detectBudgetLow(now),
    ]);

    return [
      ...planAwaitingApproval,
      ...pendingApprovals,
      ...recentDemoViews,
      ...budgetLow,
      ...hotNewLeads,
      ...coolingHighIntent,
      ...staleFollowups,
      ...demoCandidates,
    ]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 30);
  }

  private detectStaleFollowups(now: number): Promise<OpportunitySignal[]> {
    const cutoff = new Date(now - 7 * DAY_MS);
    return this.prisma.lead
      .findMany({
        where: {
          status: LeadStatus.CONTACTED,
          updatedAt: { lt: cutoff },
        },
        orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
        take: 10,
      })
      .then((leads) =>
        leads.map((lead) => {
          const days = Math.floor((now - lead.updatedAt.getTime()) / DAY_MS);
          return this.buildSignal({
            type: 'STALE_FOLLOWUP',
            severity: days >= 14 ? 'high' : 'medium',
            title: `Seguimiento pendiente — ${lead.businessName}`,
            description: `Contactado hace ${days} días sin actividad. Score ${lead.score}.`,
            leadId: lead.id,
            leadName: lead.businessName,
            detectedAt: lead.updatedAt,
            priority: 0.55 + Math.min(lead.score / 200, 0.25),
            suggestedTaskKey: 'leads.draft_followup',
          });
        }),
      );
  }

  private detectCoolingHighIntent(now: number): Promise<OpportunitySignal[]> {
    const cutoff = new Date(now - 3 * DAY_MS);
    return this.prisma.lead
      .findMany({
        where: {
          status: {
            in: [LeadStatus.INTERESTED, LeadStatus.MEETING_SCHEDULED],
          },
          updatedAt: { lt: cutoff },
        },
        orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
        take: 8,
      })
      .then((leads) =>
        leads.map((lead) => {
          const days = Math.floor((now - lead.updatedAt.getTime()) / DAY_MS);
          const isMeeting = lead.status === LeadStatus.MEETING_SCHEDULED;
          return this.buildSignal({
            type: 'HIGH_INTENT_COOLING',
            severity: isMeeting ? 'critical' : 'high',
            title: `${isMeeting ? 'Reunión' : 'Interés'} enfriándose — ${lead.businessName}`,
            description: `Sin actividad hace ${days} días en estado ${lead.status}.`,
            leadId: lead.id,
            leadName: lead.businessName,
            detectedAt: lead.updatedAt,
            priority: isMeeting ? 0.92 : 0.78,
            suggestedTaskKey: 'leads.draft_followup',
          });
        }),
      );
  }

  private detectHotNewLeads(now: number): Promise<OpportunitySignal[]> {
    const cutoff = new Date(now - 14 * DAY_MS);
    return this.prisma.lead
      .findMany({
        where: {
          status: LeadStatus.NEW,
          score: { gte: 70 },
          createdAt: { gte: cutoff },
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        take: 8,
      })
      .then((leads) =>
        leads.map((lead) =>
          this.buildSignal({
            type: 'HOT_NEW_LEAD',
            severity: lead.score >= 85 ? 'high' : 'medium',
            title: `Lead caliente — ${lead.businessName}`,
            description: `Nuevo con score ${lead.score}. Conviene primer contacto pronto.`,
            leadId: lead.id,
            leadName: lead.businessName,
            detectedAt: lead.createdAt,
            priority: 0.65 + lead.score / 300,
            suggestedTaskKey: lead.whatsapp
              ? 'leads.draft_message_whatsapp'
              : lead.instagram
                ? 'leads.draft_message_instagram'
                : 'leads.business_diagnosis',
          }),
        ),
      );
  }

  private detectPendingApprovals(now: number): Promise<OpportunitySignal[]> {
    void now;
    return this.prisma.leadAnalysis
      .findMany({
        where: {
          approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW,
        },
        include: {
          lead: { select: { id: true, businessName: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      })
      .then((analyses) =>
        analyses.map((analysis) => {
          const hours = Math.floor(
            (Date.now() - analysis.createdAt.getTime()) / (60 * 60 * 1000),
          );
          return this.buildSignal({
            type: 'PENDING_APPROVAL',
            severity: hours >= 24 ? 'high' : 'medium',
            title: `Mensaje por aprobar — ${analysis.lead.businessName}`,
            description: `Pendiente de revisión hace ${hours}h.`,
            leadId: analysis.leadId,
            leadName: analysis.lead.businessName,
            detectedAt: analysis.createdAt,
            priority: 0.7 + Math.min(hours / 48, 0.2),
            actionHref: '/master/leads/aprobaciones',
          });
        }),
      );
  }

  private async detectPlanAwaitingApproval(
    now: number,
  ): Promise<OpportunitySignal[]> {
    const steps = await this.prisma.executionPlanStep.findMany({
      where: { status: PlanStepStatus.WAITING_APPROVAL },
      include: {
        plan: {
          select: {
            id: true,
            goalId: true,
            goal: { select: { title: true } },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 8,
    });

    const signals: OpportunitySignal[] = [];

    for (const step of steps) {
      const task = await this.prisma.aiTask.findFirst({
        where: { planStepId: step.id, status: 'AWAITING_APPROVAL' },
        select: { id: true, leadId: true },
      });

      const lead = task?.leadId
        ? await this.prisma.lead.findUnique({
            where: { id: task.leadId },
            select: { id: true, businessName: true },
          })
        : null;

      const hours = Math.floor(
        (now - step.updatedAt.getTime()) / (60 * 60 * 1000),
      );
      const leadName = lead?.businessName;

      signals.push(
        this.buildSignal({
          type: 'PLAN_AWAITING_APPROVAL',
          severity: hours >= 12 ? 'critical' : 'high',
          title: leadName
            ? `Plan pausado — ${leadName}`
            : `Plan pausado — ${step.taskKey}`,
          description: `Objetivo "${step.plan.goal.title}" esperando aprobación hace ${hours}h.`,
          leadId: lead?.id,
          leadName,
          detectedAt: step.updatedAt,
          priority: 0.85 + Math.min(hours / 24, 0.1),
          suggestedTaskKey: step.taskKey,
          actionHref: step.plan.goalId
            ? `/master/leads/objetivos/${step.plan.goalId}`
            : '/master/leads/aprobaciones',
        }),
      );
    }

    return signals;
  }

  private detectDemoCandidates(now: number): Promise<OpportunitySignal[]> {
    void now;
    return this.prisma.lead
      .findMany({
        where: {
          status: { in: [LeadStatus.NEW, LeadStatus.ANALYZED] },
          score: { gte: 65 },
          hasWebsite: false,
        },
        orderBy: { score: 'desc' },
        take: 6,
      })
      .then((leads) =>
        leads.map((lead) =>
          this.buildSignal({
            type: 'DEMO_CANDIDATE',
            severity: lead.score >= 80 ? 'medium' : 'low',
            title: `Candidato a demo — ${lead.businessName}`,
            description: `Sin sitio web y score ${lead.score}. Demo puede acelerar conversión.`,
            leadId: lead.id,
            leadName: lead.businessName,
            detectedAt: lead.updatedAt,
            priority: 0.45 + lead.score / 250,
            suggestedTaskKey: 'leads.generate_demo',
          }),
        ),
      );
  }

  private detectRecentDemoViews(now: number): Promise<OpportunitySignal[]> {
    const cutoff = new Date(now - 48 * DAY_MS);

    return this.prisma.lead
      .findMany({
        where: {
          demoLastViewedAt: { gte: cutoff },
          status: {
            notIn: [LeadStatus.CLIENT, LeadStatus.LOST],
          },
        },
        orderBy: { demoLastViewedAt: 'desc' },
        take: 8,
      })
      .then((leads) =>
        leads.map((lead) => {
          const viewedAt = lead.demoLastViewedAt ?? lead.updatedAt;
          const hours = Math.max(
            0,
            Math.floor((now - viewedAt.getTime()) / (60 * 60 * 1000)),
          );
          const isFirstView = lead.demoViewCount <= 1;
          const hoursLabel =
            hours <= 0
              ? 'hace instantes'
              : hours === 1
                ? 'hace 1 hora'
                : `hace ${hours} horas`;

          return this.buildSignal({
            type: 'DEMO_VIEWED',
            severity: isFirstView && hours <= 24 ? 'high' : 'medium',
            title: isFirstView
              ? `Abrió la demo — ${lead.businessName}`
              : `Volvió a la demo — ${lead.businessName}`,
            description: isFirstView
              ? `Primera visita ${hoursLabel}. Seguimiento recomendado.`
              : `${lead.demoViewCount} visitas. Última ${hoursLabel}.`,
            leadId: lead.id,
            leadName: lead.businessName,
            detectedAt: viewedAt,
            priority: isFirstView ? 0.93 - Math.min(hours / 48, 0.15) : 0.78,
            suggestedTaskKey: 'leads.draft_followup',
            actionHref: `/master/leads/prospectos/${lead.id}`,
          });
        }),
      );
  }

  private async detectBudgetLow(now: number): Promise<OpportunitySignal[]> {
    void now;
    const budget = await this.prisma.aiCostBudget.findUnique({
      where: { scope: 'global' },
    });
    if (!budget?.monthlyLimitUsd) return [];

    const monthlyLimit = Number(budget.monthlyLimitUsd);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const spent = await this.prisma.aiTaskExecution.aggregate({
      where: { executedAt: { gte: startOfMonth }, success: true },
      _sum: { totalCostUsd: true },
    });

    const spentUsd = Number(spent._sum.totalCostUsd ?? 0);
    const remaining = monthlyLimit - spentUsd;
    const ratio = remaining / monthlyLimit;

    if (ratio > 0.2) return [];

    return [
      this.buildSignal({
        type: 'BUDGET_LOW',
        severity: ratio <= 0.05 ? 'critical' : 'high',
        title: 'Presupuesto IA bajo',
        description: `Quedan USD ${remaining.toFixed(2)} de USD ${monthlyLimit.toFixed(0)} mensual (${Math.round(ratio * 100)}%).`,
        detectedAt: new Date(),
        priority: ratio <= 0.05 ? 0.95 : 0.8,
        actionHref: '/master/leads/costos',
      }),
    ];
  }

  private buildSignal(params: {
    type: OpportunitySignalType;
    severity: OpportunitySignalSeverity;
    title: string;
    description: string;
    leadId?: string;
    leadName?: string;
    detectedAt: Date;
    priority: number;
    suggestedTaskKey?: string;
    actionHref?: string;
  }): OpportunitySignal {
    const entityKey = params.leadId ?? params.type;
    return {
      id: `${params.type}:${entityKey}:${params.detectedAt.getTime()}`,
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description,
      leadId: params.leadId,
      leadName: params.leadName,
      detectedAt: params.detectedAt.toISOString(),
      priority: Math.min(1, Math.max(0, params.priority)),
      suggestedTaskKey: params.suggestedTaskKey,
      actionHref: params.actionHref,
    };
  }
}
