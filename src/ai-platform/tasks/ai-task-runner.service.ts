import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiProvider, AiTaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CostEngineService } from '../cost-engine/cost-engine.service';
import {
  DOMAIN_EVENT_TYPES,
  type DomainEventPayload,
} from '../events/domain-event.types';
import { OutboxDispatcherService } from '../events/outbox-dispatcher.service';
import { OutboxPublisherService } from '../events/outbox-publisher.service';
import { AiMemoryService } from '../memory/ai-memory.service';
import { AiProviderRouterService } from '../providers/ai-provider-router.service';
import { AiTaskRegistry } from './ai-task-registry.service';
import type { AiTaskContext, AiTaskResult } from '../types/ai-task.types';

@Injectable()
export class AiTaskRunnerService {
  private readonly logger = new Logger(AiTaskRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiTaskRegistry,
    private readonly costEngine: CostEngineService,
    private readonly memory: AiMemoryService,
    private readonly providerRouter: AiProviderRouterService,
    private readonly outboxPublisher: OutboxPublisherService,
    private readonly outboxDispatcher: OutboxDispatcherService,
  ) {}

  async runTask(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    if (
      task.status === AiTaskStatus.CANCELLED ||
      task.status === AiTaskStatus.COMPLETED
    ) {
      return task;
    }

    const handler = this.registry.getOrThrow(task.taskKey);
    const startedAt = Date.now();

    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: {
        status: AiTaskStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    const ctx: AiTaskContext = {
      taskId: task.id,
      userId: task.createdById ?? undefined,
      leadId: task.leadId ?? undefined,
      savedSearchId: task.savedSearchId ?? undefined,
      parentTaskId: task.parentTaskId ?? undefined,
    };

    let result: AiTaskResult;
    let success = true;
    let errorMessage: string | undefined;
    let cacheHit = false;
    let cacheSavedUsd: number | undefined;

    const cacheKey =
      handler.cacheTtlSeconds && handler.cacheTtlSeconds > 0
        ? this.memory.buildKey(
            handler.key,
            task.input,
            task.selectedModel ?? handler.defaultModel,
          )
        : null;

    try {
      if (cacheKey) {
        const cached = await this.memory.get(cacheKey);
        if (cached) {
          result = { ...cached, cacheHit: true };
          cacheHit = true;
          cacheSavedUsd = cached.cacheSavedUsd;
        } else {
          result = await handler.execute(ctx, task.input);
          if (handler.cacheTtlSeconds) {
            await this.memory.set(cacheKey, result, handler.cacheTtlSeconds);
          }
        }
      } else {
        result = await handler.execute(ctx, task.input);
      }
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Task ${task.taskKey} failed: ${errorMessage}`);

      const failed = await this.prisma.aiTask.update({
        where: { id: taskId },
        data: {
          status: AiTaskStatus.FAILED,
          error: { message: errorMessage } as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      await this.persistExecution({
        taskKey: task.taskKey,
        provider: null,
        model: task.selectedModel ?? handler.defaultModel ?? null,
        usage: { promptTokens: 0, completionTokens: 0 },
        cost: {
          inputCostUsd: 0,
          outputCostUsd: 0,
          reasoningCostUsd: 0,
          totalCostUsd: 0,
        },
        durationMs: Date.now() - startedAt,
        success: false,
        errorMessage,
        leadId: task.leadId,
        savedSearchId: task.savedSearchId,
        userId: task.createdById,
        cacheHit: false,
      });

      await this.emitTaskLifecycleEvent(
        task,
        DOMAIN_EVENT_TYPES.TaskFailed,
        failed.status,
      );

      return failed;
    }

    const durationMs = Date.now() - startedAt;
    const provider = result.provider ?? AiProvider.GEMINI;
    const model =
      task.selectedModel ?? result.model ?? handler.defaultModel ?? 'unknown';

    let cost = {
      inputCostUsd: 0,
      outputCostUsd: 0,
      reasoningCostUsd: 0,
      totalCostUsd: 0,
    };

    if (result.usage && handler.category === 'ai') {
      const breakdown = await this.costEngine.calculateCost(
        provider,
        model,
        result.usage,
      );
      cost = {
        inputCostUsd: breakdown.inputCostUsd,
        outputCostUsd: breakdown.outputCostUsd + breakdown.reasoningCostUsd,
        reasoningCostUsd: breakdown.reasoningCostUsd,
        totalCostUsd: breakdown.totalCostUsd,
      };
    }

    const execution = await this.persistExecution({
      taskKey: task.taskKey,
      provider: handler.category === 'ai' ? provider : null,
      model: handler.category === 'ai' ? model : null,
      usage: result.usage ?? { promptTokens: 0, completionTokens: 0 },
      cost,
      durationMs,
      success,
      errorMessage,
      leadId: task.leadId,
      savedSearchId: task.savedSearchId,
      userId: task.createdById,
      cacheHit,
      cacheSavedUsd: cacheHit
        ? (cacheSavedUsd ?? cost.totalCostUsd)
        : undefined,
    });

    const finalStatus = handler.requiresApproval
      ? AiTaskStatus.AWAITING_APPROVAL
      : AiTaskStatus.COMPLETED;

    const updated = await this.prisma.aiTask.update({
      where: { id: taskId },
      data: {
        status: finalStatus,
        output: result.output as Prisma.InputJsonValue,
        executionId: execution.id,
        completedAt: new Date(),
      },
    });

    if (task.savedSearchId && cost.totalCostUsd > 0) {
      await this.prisma.leadSavedSearch.update({
        where: { id: task.savedSearchId },
        data: {
          taskCount: { increment: 1 },
          totalCostUsd: { increment: cost.totalCostUsd },
        },
      });
    }

    await this.emitTaskLifecycleEvent(
      task,
      DOMAIN_EVENT_TYPES.TaskCompleted,
      updated.status,
      result.output,
    );

    return { ...updated, execution, result };
  }

  async retryTask(taskId: string, userId?: string) {
    void userId;
    const task = await this.prisma.aiTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: {
        status: AiTaskStatus.PENDING,
        retryCount: { increment: 1 },
        error: Prisma.JsonNull,
        output: Prisma.JsonNull,
        startedAt: null,
        completedAt: null,
        executionId: null,
      },
    });

    return this.runTask(taskId);
  }

  async cancelTask(taskId: string) {
    return this.prisma.aiTask.update({
      where: { id: taskId },
      data: {
        status: AiTaskStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }

  async duplicateTask(taskId: string, userId?: string) {
    const task = await this.prisma.aiTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    const clone = await this.prisma.aiTask.create({
      data: {
        taskKey: task.taskKey,
        input: task.input as Prisma.InputJsonValue,
        leadId: task.leadId,
        savedSearchId: task.savedSearchId,
        createdById: userId ?? task.createdById,
        parentTaskId: task.id,
        scheduledAt: new Date(),
        status: AiTaskStatus.PENDING,
      },
    });

    return this.runTask(clone.id);
  }

  async scheduleTask(taskId: string, scheduledAt: Date) {
    return this.prisma.aiTask.update({
      where: { id: taskId },
      data: {
        scheduledAt,
        status: AiTaskStatus.PENDING,
      },
    });
  }

  async runInline<TInput, TOutput>(
    taskKey: string,
    input: TInput,
    meta: {
      userId?: string;
      leadId?: string;
      savedSearchId?: string;
    },
  ): Promise<{
    output: TOutput;
    taskId: string;
    executionId: string;
    totalCostUsd: number;
    durationMs: number;
    confidence?: number;
    cacheHit?: boolean;
  }> {
    await this.costEngine.assertBudget('global');

    const task = await this.prisma.aiTask.create({
      data: {
        taskKey,
        input: input as Prisma.InputJsonValue,
        leadId: meta.leadId,
        savedSearchId: meta.savedSearchId,
        createdById: meta.userId,
        scheduledAt: new Date(),
        status: AiTaskStatus.PENDING,
      },
    });

    const ran = await this.runTask(task.id);

    const result = ran as unknown as {
      execution?: {
        id: string;
        totalCostUsd: Prisma.Decimal;
        durationMs: number;
      };
      output?: TOutput;
      result?: AiTaskResult<TOutput>;
    };

    return {
      output: (result.output ?? result.result?.output) as TOutput,
      taskId: task.id,
      executionId: result.execution?.id ?? '',
      totalCostUsd: Number(result.execution?.totalCostUsd ?? 0),
      durationMs: result.execution?.durationMs ?? 0,
      confidence: result.result?.confidence,
      cacheHit: result.result?.cacheHit,
    };
  }

  private async emitTaskLifecycleEvent(
    task: {
      id: string;
      taskKey: string;
      planId: string | null;
      planStepId: string | null;
      goalId: string | null;
      leadId: string | null;
    },
    eventType:
      | typeof DOMAIN_EVENT_TYPES.TaskCompleted
      | typeof DOMAIN_EVENT_TYPES.TaskFailed,
    status: AiTaskStatus,
    output?: unknown,
  ) {
    if (!task.planId) return;

    const payload: DomainEventPayload = {
      taskId: task.id,
      taskKey: task.taskKey,
      planId: task.planId,
      planStepId: task.planStepId,
      goalId: task.goalId,
      leadId: task.leadId,
      status,
      output,
    };

    try {
      const outbox = await this.outboxPublisher.publish(
        eventType,
        'AiTask',
        task.id,
        payload,
      );
      await this.outboxDispatcher.dispatchOne(outbox.id);
    } catch (err) {
      this.logger.warn(`Outbox publish failed for task ${task.id}: ${err}`);
    }
  }

  private async persistExecution(params: {
    taskKey: string;
    provider: AiProvider | null;
    model: string | null;
    usage: {
      promptTokens: number;
      completionTokens: number;
      reasoningTokens?: number;
    };
    cost: {
      inputCostUsd: number;
      outputCostUsd: number;
      reasoningCostUsd: number;
      totalCostUsd: number;
    };
    durationMs: number;
    success: boolean;
    errorMessage?: string;
    leadId: string | null;
    savedSearchId: string | null;
    userId: string | null;
    cacheHit: boolean;
    cacheSavedUsd?: number;
  }) {
    return this.prisma.aiTaskExecution.create({
      data: {
        taskKey: params.taskKey,
        provider: params.provider ?? undefined,
        model: params.model ?? undefined,
        promptTokens: params.usage.promptTokens,
        completionTokens: params.usage.completionTokens,
        reasoningTokens: params.usage.reasoningTokens ?? 0,
        inputCostUsd: params.cost.inputCostUsd,
        outputCostUsd: params.cost.outputCostUsd,
        totalCostUsd: params.cost.totalCostUsd,
        durationMs: params.durationMs,
        cacheHit: params.cacheHit,
        cacheSavedUsd: params.cacheSavedUsd,
        success: params.success,
        errorMessage: params.errorMessage,
        leadId: params.leadId,
        savedSearchId: params.savedSearchId,
        userId: params.userId,
      },
    });
  }
}
