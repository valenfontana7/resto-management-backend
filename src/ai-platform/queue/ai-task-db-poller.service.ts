import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiTaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiTaskRunnerService } from '../tasks/ai-task-runner.service';

@Injectable()
export class AiTaskDbPollerService {
  private readonly logger = new Logger(AiTaskDbPollerService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AiTaskRunnerService,
  ) {}

  @Cron('*/30 * * * * *')
  async pollPendingTasks(): Promise<void> {
    if (process.env.REDIS_URL) return;
    if (this.processing) return;

    this.processing = true;
    try {
      const now = new Date();
      const pending = await this.prisma.aiTask.findMany({
        where: {
          status: AiTaskStatus.PENDING,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });

      for (const task of pending) {
        try {
          await this.runner.runTask(task.id);
        } catch (error) {
          this.logger.warn(
            `DB poll failed for task ${task.id}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
