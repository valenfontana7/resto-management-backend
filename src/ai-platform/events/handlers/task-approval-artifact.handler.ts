import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiTaskStatus } from '@prisma/client';
import { DOMAIN_EVENT_TYPES } from '../domain-event.types';
import { DomainEventHandlerRegistry } from '../domain-event-handler.registry';
import { PlanApprovalBridgeService } from '../../planner/plan-approval-bridge.service';

@Injectable()
export class TaskApprovalArtifactHandler implements OnModuleInit {
  static readonly HANDLER_KEY = 'plan.approval_artifact';
  static readonly PRIORITY = 25;

  constructor(
    private readonly registry: DomainEventHandlerRegistry,
    private readonly approvalBridge: PlanApprovalBridgeService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      handlerKey: TaskApprovalArtifactHandler.HANDLER_KEY,
      eventType: DOMAIN_EVENT_TYPES.TaskCompleted,
      priority: TaskApprovalArtifactHandler.PRIORITY,
      handle: async (payload) => {
        if (payload.status !== AiTaskStatus.AWAITING_APPROVAL) return;
        if (!payload.planId) return;
        await this.approvalBridge.ensureApprovalRecord(payload.taskId);
      },
    });
  }
}
