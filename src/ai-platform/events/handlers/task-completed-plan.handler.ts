import { Injectable, OnModuleInit } from '@nestjs/common';
import { DOMAIN_EVENT_TYPES } from '../domain-event.types';
import { DomainEventHandlerRegistry } from '../domain-event-handler.registry';
import { PlanExecutorService } from '../../planner/plan-executor.service';

@Injectable()
export class TaskCompletedPlanHandler implements OnModuleInit {
  static readonly HANDLER_KEY = 'plan.task_completed';
  static readonly PRIORITY = 20;

  constructor(
    private readonly registry: DomainEventHandlerRegistry,
    private readonly planExecutor: PlanExecutorService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      handlerKey: TaskCompletedPlanHandler.HANDLER_KEY,
      eventType: DOMAIN_EVENT_TYPES.TaskCompleted,
      priority: TaskCompletedPlanHandler.PRIORITY,
      handle: async (payload) => {
        if (!payload.planId) return;
        await this.planExecutor.onTaskCompleted(payload.taskId);
      },
    });

    this.registry.register({
      handlerKey: 'plan.task_failed',
      eventType: DOMAIN_EVENT_TYPES.TaskFailed,
      priority: TaskCompletedPlanHandler.PRIORITY,
      handle: async (payload) => {
        if (!payload.planId) return;
        await this.planExecutor.onTaskCompleted(payload.taskId);
      },
    });
  }
}
