import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GoalEngineService } from '../ai-platform/goal-engine/goal-engine.service';
import { AiPlannerService } from '../ai-platform/planner/ai-planner.service';
import {
  CommercialDecisionService,
  CommercialTodayService,
} from './decisioning/commercial-today.service';
import type { ActionIntelligenceResult } from './types/commercial-intelligence.types';

@ApiTags('Commercial Intelligence')
@Controller('api/super-admin/commercial-intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class CommercialIntelligenceController {
  constructor(
    private readonly today: CommercialTodayService,
    private readonly decisions: CommercialDecisionService,
    private readonly goalEngine: GoalEngineService,
    private readonly planner: AiPlannerService,
  ) {}

  @Get('today')
  getToday() {
    return this.today.getTodayDashboard();
  }

  @Get('leads/:leadId/preview')
  previewLead(@Param('leadId') leadId: string) {
    return this.today.previewLead(leadId);
  }

  @Post('leads/:leadId/simulate')
  simulate(@Param('leadId') leadId: string, @Body() body: { taskKey: string }) {
    return this.today.simulateModels(leadId, body.taskKey);
  }

  @Get('decisions')
  listDecisions(@Query('limit') limit?: string) {
    return this.decisions.listRecent(limit ? Number(limit) : 20);
  }

  @Post('recommendations/act')
  async actOnRecommendation(
    @Body()
    body: {
      recommendation: ActionIntelligenceResult;
      createGoal?: boolean;
    },
    @Request() req,
  ) {
    const userId = req.user?.userId as string | undefined;
    const rec = body.recommendation;

    const decision = await this.decisions.recordAccepted(rec, userId);

    if (body.createGoal && rec.targetId) {
      const goal = await this.goalEngine.create(
        {
          title: rec.label.slice(0, 80),
          objective: `Acción comercial: ${rec.label}. ${rec.reason}`,
          targetCount: 1,
          budgetUsd: Math.max(rec.estimatedCostUsd * 3, 1),
        },
        userId,
      );
      const plan = await this.planner.buildPlan(goal.id, userId);
      return {
        decision,
        goal,
        plan,
        message: 'Objetivo y plan creados (L1 — revisar y aprobar)',
      };
    }

    return { decision, message: 'Decisión registrada' };
  }
}
