import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Lead, PlanStepStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventHandlerRegistry } from '../ai-platform/events/domain-event-handler.registry';
import { DOMAIN_EVENT_TYPES } from '../ai-platform/events/domain-event.types';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';
import type { LeadDiscoveryResult } from './types/lead-discovery.types';

const ENTITY_REF_PATTERN = /^entity-\d+$/;

@Injectable()
export class PlanLeadBindingService implements OnModuleInit {
  static readonly HANDLER_KEY = 'leads.plan_discovery_binding';
  static readonly PRIORITY = 10;

  private readonly logger = new Logger(PlanLeadBindingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly registry: DomainEventHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      handlerKey: PlanLeadBindingService.HANDLER_KEY,
      eventType: DOMAIN_EVENT_TYPES.TaskCompleted,
      priority: PlanLeadBindingService.PRIORITY,
      handle: async (payload) => {
        if (
          payload.taskKey !== 'leads.discover_restaurants' ||
          !payload.planId
        ) {
          return;
        }
        await this.bindLeadsFromDiscovery(
          payload.planId,
          payload.output as LeadDiscoveryResult | undefined,
          payload.taskId,
        );
      },
    });
  }

  async bindLeadsFromDiscovery(
    planId: string,
    output: LeadDiscoveryResult | undefined,
    discoveryTaskId: string,
  ): Promise<Record<string, string>> {
    const plan = await this.prisma.executionPlan.findUnique({
      where: { id: planId },
      include: {
        goal: true,
        steps: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!plan || !output?.candidates?.length) {
      return {};
    }

    const existingSummary =
      (plan.summary as Record<string, unknown> | null) ?? {};
    const existingBindings =
      (existingSummary.entityBindings as Record<string, string> | undefined) ??
      {};
    if (Object.keys(existingBindings).length > 0) {
      return existingBindings;
    }

    const targetCount = plan.goal.targetCount;
    const candidates = output.candidates.slice(0, targetCount);
    const dtos: CreateLeadDto[] = candidates.map((c) => ({
      businessName: c.businessName,
      category: c.category,
      city: c.city,
      website: c.website,
      instagram: c.instagram,
      whatsapp: c.whatsapp,
      hasWebsite: c.hasWebsite,
      hasOnlineMenu: c.hasOnlineMenu,
      hasReservations: c.hasReservations,
      hasWhatsapp: c.hasWhatsapp,
      discoveredWithAi: true,
      discoverySourceUrl: c.sourceUrl,
      notes: c.whyFit ? `Discovery: ${c.whyFit}` : undefined,
    }));

    const { created, skipped } = await this.leadsService.importCandidates(
      dtos,
      plan.goal.createdById ?? undefined,
    );

    const bindings: Record<string, string> = {};
    for (let i = 0; i < created.length; i++) {
      bindings[`entity-${i + 1}`] = (created[i] as Lead).id;
    }

    if (skipped.length > 0) {
      this.logger.warn(
        `Plan ${planId}: ${skipped.length} candidatos omitidos al importar`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const step of plan.steps) {
        const ref = step.entityRef;
        if (!ref || !ENTITY_REF_PATTERN.test(ref)) continue;

        const leadId = bindings[ref];
        if (leadId) {
          const input = {
            ...((step.input as Record<string, unknown>) ?? {}),
            leadId,
            entityRef: ref,
          };
          await tx.executionPlanStep.update({
            where: { id: step.id },
            data: {
              input: input as Prisma.InputJsonValue,
              ...(step.status === PlanStepStatus.WAITING_DEPENDENCY ||
              step.status === PlanStepStatus.PENDING
                ? { status: PlanStepStatus.PENDING, skipReason: null }
                : {}),
            },
          });
        } else if (step.status === PlanStepStatus.PENDING) {
          await tx.executionPlanStep.update({
            where: { id: step.id },
            data: {
              status: PlanStepStatus.SKIPPED,
              skipReason: 'Sin lead importado para esta entidad',
            },
          });
        }
      }

      await tx.executionPlan.update({
        where: { id: planId },
        data: {
          summary: {
            ...existingSummary,
            entityBindings: bindings,
            discoveryTaskId,
            importSkipped: skipped.length,
          } as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.log(
      `Plan ${planId}: ${created.length} leads vinculados (${Object.keys(bindings).join(', ')})`,
    );

    return bindings;
  }

  resolveLeadIdFromStep(step: {
    entityRef: string | null;
    input: unknown;
  }): string | undefined {
    const input = (step.input as Record<string, unknown>) ?? {};
    const leadId = input.leadId;
    if (
      typeof leadId === 'string' &&
      leadId.length > 0 &&
      !ENTITY_REF_PATTERN.test(leadId)
    ) {
      return leadId;
    }
    return undefined;
  }
}
