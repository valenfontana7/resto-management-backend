import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { AiTaskStatus, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CostEngineService } from '../cost-engine/cost-engine.service';
import { AiTaskRunnerService } from '../tasks/ai-task-runner.service';
import type { EnqueueTaskOptions } from '../types/ai-task.types';

export const AI_TASKS_QUEUE = 'ai-tasks';

@Injectable()
export class AiTaskQueueService {
  private readonly logger = new Logger(AiTaskQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AiTaskRunnerService,
    private readonly costEngine: CostEngineService,
    @Optional()
    @InjectQueue(AI_TASKS_QUEUE)
    private readonly queue: Queue | null,
  ) {}

  isRedisMode(): boolean {
    return this.queue !== null;
  }

  async enqueue(options: EnqueueTaskOptions) {
    await this.costEngine.assertBudget('global');

    const task = await this.prisma.aiTask.create({
      data: {
        taskKey: options.taskKey,
        input: options.input as Prisma.InputJsonValue,
        leadId: options.leadId,
        savedSearchId: options.savedSearchId,
        createdById: options.createdById,
        scheduledAt: options.scheduledAt ?? new Date(),
        parentTaskId: options.parentTaskId,
        maxRetries: options.maxRetries ?? 3,
        status: AiTaskStatus.PENDING,
      },
    });

    if (this.queue) {
      const delay = options.scheduledAt
        ? Math.max(0, options.scheduledAt.getTime() - Date.now())
        : 0;

      await this.queue.add(
        'run',
        { taskId: task.id },
        {
          jobId: task.id,
          delay,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      return task;
    }

    if (options.runImmediately !== false && !options.scheduledAt) {
      return this.runner.runTask(task.id);
    }

    return task;
  }

  async processTask(taskId: string) {
    return this.runner.runTask(taskId);
  }

  async cancelTask(taskId: string) {
    if (this.queue) {
      const job = await this.queue.getJob(taskId);
      if (job) await job.remove();
    }
    return this.runner.cancelTask(taskId);
  }

  async listTasks(filters: {
    status?: AiTaskStatus;
    leadId?: string;
    savedSearchId?: string;
    taskKey?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.AiTaskWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.leadId) where.leadId = filters.leadId;
    if (filters.savedSearchId) where.savedSearchId = filters.savedSearchId;
    if (filters.taskKey) where.taskKey = filters.taskKey;

    const [items, total] = await Promise.all([
      this.prisma.aiTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        include: { execution: true },
      }),
      this.prisma.aiTask.count({ where }),
    ]);

    return { items, total };
  }

  async getTask(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { execution: true },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    return task;
  }
}
