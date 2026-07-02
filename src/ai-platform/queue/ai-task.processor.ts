import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AiTaskRunnerService } from '../tasks/ai-task-runner.service';
import { AI_TASKS_QUEUE } from './ai-task-queue.service';

@Processor(AI_TASKS_QUEUE)
export class AiTaskProcessor extends WorkerHost {
  private readonly logger = new Logger(AiTaskProcessor.name);

  constructor(private readonly runner: AiTaskRunnerService) {
    super();
  }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    this.logger.debug(`Processing AI task job ${job.id}`);
    await this.runner.runTask(job.data.taskId);
  }
}
