import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AiPlatformController } from './ai-platform.controller';
import { AiPlannerController } from './ai-planner.controller';
import { CostEngineService } from './cost-engine/cost-engine.service';
import { CostDashboardService } from './cost-engine/cost-dashboard.service';
import { AiPricingService } from './cost-engine/ai-pricing.service';
import { AiBudgetService } from './cost-engine/ai-budget.service';
import { GeminiProvider } from './providers/gemini.provider';
import { AiProviderRouterService } from './providers/ai-provider-router.service';
import { AiMemoryService } from './memory/ai-memory.service';
import { AiTaskRegistry } from './tasks/ai-task-registry.service';
import { AiTaskRunnerService } from './tasks/ai-task-runner.service';
import {
  AI_TASKS_QUEUE,
  AiTaskQueueService,
} from './queue/ai-task-queue.service';
import { AiTaskProcessor } from './queue/ai-task.processor';
import { AiTaskDbPollerService } from './queue/ai-task-db-poller.service';
import { GoalEngineService } from './goal-engine/goal-engine.service';
import { AiPlannerService } from './planner/ai-planner.service';
import { PlanComposerService } from './planner/plan-composer.service';
import { PlanExecutorService } from './planner/plan-executor.service';
import { CostOptimizerService } from './planner/cost-optimizer.service';
import { ModelSelectorService } from './planner/model-selector.service';
import { PlannerMemoryService } from './planner/planner-memory.service';
import { PlannerTimelineService } from './planner/planner-timeline.service';
import { ModelSelectionPolicyService } from './pricing/model-selection-policy.service';
import {
  AiInsightsService,
  RoiCalculatorService,
} from './planner/ai-insights.service';
import {
  AcquireLeadsStrategy,
  BookMeetingsStrategy,
  GoalStrategyRegistry,
  ReactivateLeadsStrategy,
} from './planner/goal-strategies';
import { OutboxPublisherService } from './events/outbox-publisher.service';
import { OutboxDispatcherService } from './events/outbox-dispatcher.service';
import { DomainEventHandlerRegistry } from './events/domain-event-handler.registry';
import { TaskCompletedPlanHandler } from './events/handlers/task-completed-plan.handler';

const redisAvailable = !!process.env.REDIS_URL;

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ScheduleModule.forRoot(),
    ...(redisAvailable
      ? [BullModule.registerQueue({ name: AI_TASKS_QUEUE })]
      : []),
  ],
  controllers: [AiPlatformController, AiPlannerController],
  providers: [
    CostEngineService,
    CostDashboardService,
    AiPricingService,
    AiBudgetService,
    GeminiProvider,
    AiProviderRouterService,
    AiMemoryService,
    AiTaskRegistry,
    AiTaskRunnerService,
    AiTaskQueueService,
    GoalEngineService,
    AiPlannerService,
    PlanComposerService,
    PlanExecutorService,
    CostOptimizerService,
    ModelSelectorService,
    ModelSelectionPolicyService,
    PlannerMemoryService,
    PlannerTimelineService,
    AiInsightsService,
    RoiCalculatorService,
    AcquireLeadsStrategy,
    ReactivateLeadsStrategy,
    BookMeetingsStrategy,
    GoalStrategyRegistry,
    OutboxPublisherService,
    OutboxDispatcherService,
    DomainEventHandlerRegistry,
    TaskCompletedPlanHandler,
    ...(redisAvailable ? [AiTaskProcessor] : [AiTaskDbPollerService]),
  ],
  exports: [
    AiTaskRegistry,
    AiTaskRunnerService,
    AiTaskQueueService,
    CostEngineService,
    CostDashboardService,
    AiProviderRouterService,
    AiMemoryService,
    PlannerMemoryService,
    ModelSelectionPolicyService,
    GoalEngineService,
    AiPlannerService,
    PlanExecutorService,
    PlannerTimelineService,
    DomainEventHandlerRegistry,
    OutboxPublisherService,
  ],
})
export class AiPlatformModule implements OnModuleInit {
  constructor(private readonly registry: AiTaskRegistry) {}

  onModuleInit(): void {
    // Leads tasks register themselves via LeadsModule
  }

  registerHandlers(handlers: Parameters<AiTaskRegistry['registerMany']>[0]) {
    this.registry.registerMany(handlers);
  }
}
