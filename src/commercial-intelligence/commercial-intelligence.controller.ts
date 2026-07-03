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

import { CommercialActionOrchestratorService } from './decisioning/commercial-action-orchestrator.service';

import { CommercialAutonomyService } from './decisioning/commercial-autonomy.service';

import {
  CommercialDecisionService,
  CommercialTodayService,
} from './decisioning/commercial-today.service';

import { CommercialWorkQueueService } from './read-models/commercial-work-queue.service';

import { OpportunityFeedService } from './read-models/opportunity-feed.service';

import { CommercialLearningService } from './read-models/commercial-learning.service';

import type {
  ActionIntelligenceResult,
  CommercialActionMode,
} from './types/commercial-intelligence.types';

@ApiTags('Commercial Intelligence')
@Controller('api/super-admin/commercial-intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class CommercialIntelligenceController {
  constructor(
    private readonly today: CommercialTodayService,

    private readonly decisions: CommercialDecisionService,

    private readonly opportunityFeed: OpportunityFeedService,

    private readonly learning: CommercialLearningService,

    private readonly workQueue: CommercialWorkQueueService,

    private readonly orchestrator: CommercialActionOrchestratorService,

    private readonly autonomy: CommercialAutonomyService,
  ) {}

  @Get('nav-counts')
  getNavCounts() {
    return this.workQueue.getNavCounts();
  }

  @Get('work-queue')
  getWorkQueue(@Query('limit') limit?: string) {
    return this.workQueue.getQueue(limit ? Number(limit) : 30);
  }

  @Post('work-queue/dismiss')
  dismissWorkQueueItem(@Body() body: { itemId: string }) {
    this.workQueue.dismiss(body.itemId);

    return { success: true };
  }

  @Get('autonomy/status')
  getAutonomyStatus() {
    return {
      autoExecuteEnabled: this.autonomy.isAutoExecuteEnabled(),

      envFlag: 'COMMERCIAL_AUTO_EXECUTE',
    };
  }

  @Get('opportunities/feed')
  getOpportunityFeed(@Query('limit') limit?: string) {
    return this.opportunityFeed.getFeed(limit ? Number(limit) : 20);
  }

  @Get('learning/summary')
  getLearningSummary(@Query('limit') limit?: string) {
    return this.learning.getSummary(limit ? Number(limit) : 25);
  }

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

      mode?: CommercialActionMode;

      createGoal?: boolean;
    },

    @Request() req,
  ) {
    const userId = req.user?.userId as string | undefined;

    const rec = body.recommendation;

    const mode: CommercialActionMode =
      body.mode ?? (body.createGoal === false ? 'record' : 'l1');

    return this.orchestrator.act(rec, mode, userId);
  }

  @Post('recommendations/act-batch')
  async actOnRecommendationBatch(
    @Body()
    body: {
      recommendations: ActionIntelligenceResult[];

      mode: 'express' | 'auto';

      maxItems?: number;
    },

    @Request() req,
  ) {
    const userId = req.user?.userId as string | undefined;

    return this.orchestrator.actBatch(
      body.recommendations,

      body.mode,

      userId,

      body.maxItems ?? 5,
    );
  }
}
