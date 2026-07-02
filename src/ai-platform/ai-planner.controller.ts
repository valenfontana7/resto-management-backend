import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateGoalDto, UpdateGoalDto, UpdatePlanDto } from './dto/ai-goal.dto';
import { GoalEngineService } from './goal-engine/goal-engine.service';
import { AiPlannerService } from './planner/ai-planner.service';
import { PlanExecutorService } from './planner/plan-executor.service';
import { PlannerTimelineService } from './planner/planner-timeline.service';
import {
  AiInsightsService,
  RoiCalculatorService,
} from './planner/ai-insights.service';

@ApiTags('AI Planner')
@Controller('api/super-admin/ai/planner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class AiPlannerController {
  constructor(
    private readonly goalEngine: GoalEngineService,
    private readonly planner: AiPlannerService,
    private readonly executor: PlanExecutorService,
    private readonly timeline: PlannerTimelineService,
    private readonly insights: AiInsightsService,
    private readonly roi: RoiCalculatorService,
  ) {}

  @Get('goals')
  listGoals(@Request() req) {
    return this.goalEngine.list(req.user?.userId);
  }

  @Post('goals')
  createGoal(@Body() dto: CreateGoalDto, @Request() req) {
    return this.goalEngine.create(dto, req.user?.userId);
  }

  @Get('goals/:id')
  getGoal(@Param('id') id: string) {
    return this.goalEngine.get(id);
  }

  @Patch('goals/:id')
  updateGoal(@Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goalEngine.update(id, dto);
  }

  @Post('goals/:id/pause')
  pauseGoal(@Param('id') id: string) {
    return this.goalEngine.pause(id);
  }

  @Post('goals/:id/resume')
  resumeGoal(@Param('id') id: string) {
    return this.goalEngine.resume(id);
  }

  @Post('goals/:id/cancel')
  cancelGoal(@Param('id') id: string) {
    return this.goalEngine.cancel(id);
  }

  @Get('goals/:id/progress')
  getProgress(@Param('id') id: string) {
    return this.goalEngine.getProgress(id);
  }

  @Get('goals/:id/roi')
  getRoi(@Param('id') id: string) {
    return this.roi.calculateForGoal(id);
  }

  @Get('goals/:id/timeline')
  getGoalTimeline(@Param('id') id: string) {
    return this.timeline.getTimeline(id);
  }

  @Post('goals/:id/plan')
  buildPlan(@Param('id') id: string, @Request() req) {
    return this.planner.buildPlan(id, req.user?.userId);
  }

  @Get('plans/:id')
  getPlan(@Param('id') id: string) {
    return this.planner.getPlan(id);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.planner.updatePlan(id, dto);
  }

  @Post('plans/:id/approve')
  approvePlan(@Param('id') id: string, @Request() req) {
    return this.planner.approvePlan(id, req.user?.userId);
  }

  @Post('plans/:id/execute')
  async executePlan(@Param('id') id: string) {
    await this.executor.startPlan(id);
    return this.planner.getPlan(id);
  }

  @Get('plans/:id/timeline')
  getPlanTimeline(@Param('id') id: string) {
    return this.timeline.getPlanTimeline(id);
  }

  @Get('insights')
  async listInsights(@Query('goalId') goalId?: string) {
    await this.insights.generateGlobalInsights();
    return this.insights.listInsights(goalId);
  }
}
