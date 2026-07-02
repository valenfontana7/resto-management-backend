import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiProvider, AiTaskStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CostDashboardService } from './cost-engine/cost-dashboard.service';
import { AiPricingService } from './cost-engine/ai-pricing.service';
import { AiBudgetService } from './cost-engine/ai-budget.service';
import { AiTaskQueueService } from './queue/ai-task-queue.service';
import { AiTaskRunnerService } from './tasks/ai-task-runner.service';
import { AiTaskRegistry } from './tasks/ai-task-registry.service';
import { EnqueueAiTaskDto } from './dto/enqueue-ai-task.dto';
import { CreateAiPricingDto, UpdateAiPricingDto } from './dto/ai-pricing.dto';
import { UpsertAiBudgetDto } from './dto/ai-budget.dto';
import { ScheduleAiTaskDto } from './dto/schedule-ai-task.dto';

@ApiTags('AI Platform')
@Controller('api/super-admin/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class AiPlatformController {
  constructor(
    private readonly queue: AiTaskQueueService,
    private readonly runner: AiTaskRunnerService,
    private readonly registry: AiTaskRegistry,
    private readonly costDashboard: CostDashboardService,
    private readonly pricing: AiPricingService,
    private readonly budgets: AiBudgetService,
  ) {}

  @Get('tasks/registry')
  listRegistry() {
    return this.registry.list();
  }

  @Post('tasks')
  enqueue(@Body() dto: EnqueueAiTaskDto, @Request() req) {
    return this.queue.enqueue({
      taskKey: dto.taskKey,
      input: dto.input,
      leadId: dto.leadId,
      savedSearchId: dto.savedSearchId,
      createdById: req.user?.userId,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      parentTaskId: dto.parentTaskId,
      runImmediately: dto.runImmediately,
    });
  }

  @Get('tasks')
  listTasks(
    @Query('status') status?: AiTaskStatus,
    @Query('leadId') leadId?: string,
    @Query('savedSearchId') savedSearchId?: string,
    @Query('taskKey') taskKey?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.queue.listTasks({
      status,
      leadId,
      savedSearchId,
      taskKey,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    return this.queue.getTask(id);
  }

  @Post('tasks/:id/retry')
  retry(@Param('id') id: string, @Request() req) {
    return this.runner.retryTask(id, req.user?.userId);
  }

  @Post('tasks/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.queue.cancelTask(id);
  }

  @Post('tasks/:id/duplicate')
  duplicate(@Param('id') id: string, @Request() req) {
    return this.runner.duplicateTask(id, req.user?.userId);
  }

  @Patch('tasks/:id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleAiTaskDto) {
    return this.runner.scheduleTask(id, new Date(dto.scheduledAt));
  }

  @Get('costs/summary')
  costSummary() {
    return this.costDashboard.getSummary();
  }

  @Get('costs/dashboard')
  costDashboardData() {
    return this.costDashboard.getDashboard();
  }

  @Get('costs/executions')
  listExecutions(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('taskKey') taskKey?: string,
    @Query('leadId') leadId?: string,
    @Query('savedSearchId') savedSearchId?: string,
  ) {
    return this.costDashboard.listExecutions({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      taskKey,
      leadId,
      savedSearchId,
    });
  }

  @Get('costs/by-lead/:leadId')
  costByLead(@Param('leadId') leadId: string) {
    return this.costDashboard.getCostByLead(leadId);
  }

  @Get('costs/by-campaign/:savedSearchId')
  costByCampaign(@Param('savedSearchId') savedSearchId: string) {
    return this.costDashboard.getCostByCampaign(savedSearchId);
  }

  @Get('pricing')
  listPricing(@Query('provider') provider?: AiProvider) {
    return this.pricing.list(provider);
  }

  @Post('pricing')
  createPricing(@Body() dto: CreateAiPricingDto) {
    return this.pricing.create(dto);
  }

  @Patch('pricing/:id')
  updatePricing(@Param('id') id: string, @Body() dto: UpdateAiPricingDto) {
    return this.pricing.update(id, dto);
  }

  @Delete('pricing/:id')
  deactivatePricing(@Param('id') id: string) {
    return this.pricing.deactivate(id);
  }

  @Get('budgets')
  listBudgets() {
    return this.budgets.list();
  }

  @Post('budgets')
  upsertBudget(@Body() dto: UpsertAiBudgetDto) {
    return this.budgets.upsert(dto);
  }
}
