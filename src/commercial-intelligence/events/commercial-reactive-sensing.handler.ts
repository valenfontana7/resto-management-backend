import { Injectable, OnModuleInit } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { DOMAIN_EVENT_TYPES } from '../../ai-platform/events/domain-event.types';
import { DomainEventHandlerRegistry } from '../../ai-platform/events/domain-event-handler.registry';
import { CommercialDecisionService } from '../decisioning/commercial-today.service';
import { OpportunityFeedService } from '../read-models/opportunity-feed.service';
import type { OpportunitySignal } from '../types/commercial-intelligence.types';

@Injectable()
export class CommercialReactiveSensingHandler implements OnModuleInit {
  static readonly HANDLER_KEY = 'ci.reactive_sensing';
  static readonly PRIORITY = 30;

  constructor(
    private readonly registry: DomainEventHandlerRegistry,
    private readonly feed: OpportunityFeedService,
    private readonly decisions: CommercialDecisionService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      handlerKey: CommercialReactiveSensingHandler.HANDLER_KEY,
      eventType: DOMAIN_EVENT_TYPES.TaskCompleted,
      priority: CommercialReactiveSensingHandler.PRIORITY,
      handle: async (payload) => {
        this.feed.invalidateCache();
        if (payload.status === 'AWAITING_APPROVAL' && payload.leadId) {
          this.feed.pushReactiveSignal(
            this.buildPendingApprovalSignal(payload.leadId, payload.taskKey),
          );
        }
        if (payload.goalId) {
          await this.decisions.syncOutcomeForGoal(payload.goalId, 'progressed');
        }
      },
    });

    this.registry.register({
      handlerKey: `${CommercialReactiveSensingHandler.HANDLER_KEY}.failed`,
      eventType: DOMAIN_EVENT_TYPES.TaskFailed,
      priority: CommercialReactiveSensingHandler.PRIORITY,
      handle: async (payload) => {
        this.feed.invalidateCache();
        if (payload.goalId) {
          await this.decisions.syncOutcomeForGoal(payload.goalId, 'stalled');
        }
      },
    });
  }

  async onLeadStatusChanged(
    leadId: string,
    newStatus: LeadStatus,
  ): Promise<void> {
    this.feed.invalidateCache();
    const outcome =
      newStatus === LeadStatus.CLIENT
        ? 'converted'
        : newStatus === LeadStatus.LOST
          ? 'lost'
          : null;
    if (!outcome) return;

    const decision = await this.decisions.findLatestForLead(leadId);
    if (decision) {
      await this.decisions.updateOutcome(decision.id, {
        outcomeStatus: outcome,
      });
    }
  }

  onDemoViewed(params: {
    leadId: string;
    businessName: string;
    viewCount: number;
    viewedAt: Date;
    isFirstView: boolean;
  }): void {
    this.feed.invalidateCache();

    const { leadId, businessName, viewCount, viewedAt, isFirstView } = params;

    this.feed.pushReactiveSignal({
      id: `reactive:DEMO_VIEWED:${leadId}:${viewedAt.getTime()}`,
      type: 'DEMO_VIEWED',
      severity: isFirstView ? 'high' : 'medium',
      title: isFirstView
        ? `Abrió la demo — ${businessName}`
        : `Volvió a la demo — ${businessName}`,
      description: isFirstView
        ? 'El prospecto abrió el link de la demo. Momento ideal para un follow-up.'
        : `Visita #${viewCount}. Revisó la demo nuevamente.`,
      leadId,
      leadName: businessName,
      detectedAt: viewedAt.toISOString(),
      priority: isFirstView ? 0.94 : 0.8,
      suggestedTaskKey: 'leads.draft_followup',
      actionHref: `/master/leads/prospectos/${leadId}`,
    });
  }

  private buildPendingApprovalSignal(
    leadId: string,
    taskKey: string,
  ): OpportunitySignal {
    return {
      id: `reactive:PENDING_APPROVAL:${leadId}:${Date.now()}`,
      type: 'PENDING_APPROVAL',
      severity: 'high',
      title: 'Aprobación requerida',
      description: `Tarea ${taskKey} completada y esperando revisión.`,
      leadId,
      detectedAt: new Date().toISOString(),
      priority: 0.88,
      actionHref: '/master/leads/aprobaciones',
    };
  }
}
