import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ShiftService } from './services/shift.service';
import { CoordinationService } from './services/coordination.service';
import { HandoffService } from './services/handoff.service';
import { LineProjectionService } from './services/line-projection.service';
import { StationsService } from './services/stations.service';
import { EscalationConfigService } from './services/escalation-config.service';
import { TimelineProjectionService } from './services/timeline-projection.service';
import { MoveRoutingService } from './services/move-routing.service';
import { ResolutionMemoryService } from './services/resolution-memory.service';
import { ShiftForecastService } from './services/shift-forecast.service';
import { TacticBenchmarkService } from './services/tactic-benchmark.service';
import { TacticSimulationService } from './services/tactic-simulation.service';
import { OperationalRoutineService } from './services/operational-routine.service';
import { EpisodeLoggingService } from './services/episode-logging.service';
import { OperationShiftSegment } from '@prisma/client';
import {
  AcceptHandoffDto,
  Declare86Dto,
  DeclareIncidentDto,
  HelpRequestDto,
  OpenCoordinationDto,
  OpenShiftDto,
  PublishHandoffDto,
  PutEscalationConfigDto,
  PutOperationalRoutinesDto,
  PutStationsDto,
  RejectCoordinationDto,
  RequestApprovalDto,
  ResolveCoordinationDto,
  RouteIntelligenceMoveDto,
  SimulateTacticDto,
  UpdateRosterDto,
} from './dto/operations.dto';

@Controller('api/restaurants/:restaurantId/operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(
    private readonly shifts: ShiftService,
    private readonly coordinations: CoordinationService,
    private readonly handoffs: HandoffService,
    private readonly line: LineProjectionService,
    private readonly stations: StationsService,
    private readonly escalationConfig: EscalationConfigService,
    private readonly timeline: TimelineProjectionService,
    private readonly moveRouting: MoveRoutingService,
    private readonly resolutionMemory: ResolutionMemoryService,
    private readonly shiftForecast: ShiftForecastService,
    private readonly tacticBenchmarks: TacticBenchmarkService,
    private readonly tacticSimulation: TacticSimulationService,
    private readonly routines: OperationalRoutineService,
    private readonly episodes: EpisodeLoggingService,
  ) {}

  // --- Shift ---

  @Get('shifts/current')
  getCurrentShift(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.shifts.getCurrent(restaurantId, user.userId);
  }

  @Post('shifts/open')
  openShift(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: OpenShiftDto,
  ) {
    return this.shifts.open(restaurantId, user.userId, dto);
  }

  @Post('shifts/:shiftId/roster')
  updateRoster(
    @Param('restaurantId') restaurantId: string,
    @Param('shiftId') shiftId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateRosterDto,
  ) {
    return this.shifts.updateRoster(restaurantId, user.userId, shiftId, dto);
  }

  @Post('shifts/:shiftId/start-closing')
  startClosing(
    @Param('restaurantId') restaurantId: string,
    @Param('shiftId') shiftId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.shifts.startClosing(restaurantId, user.userId, shiftId);
  }

  @Post('shifts/:shiftId/close')
  closeShift(
    @Param('restaurantId') restaurantId: string,
    @Param('shiftId') shiftId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.shifts.close(restaurantId, user.userId, shiftId);
  }

  @Get('memory/patterns')
  getActivePatterns(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.resolutionMemory.listActivePatterns(restaurantId, user.userId);
  }

  @Get('memory/episodes/recent')
  getRecentEpisodes(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    const take =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20) : 10;
    return this.episodes.listRecent(restaurantId, user.userId, take);
  }

  @Get('memory/benchmarks')
  listBenchmarks(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('situationType') situationType?: string,
  ) {
    if (situationType?.trim()) {
      return this.tacticBenchmarks.getBenchmark(
        restaurantId,
        user.userId,
        situationType,
      );
    }
    return this.tacticBenchmarks.listForRestaurant(restaurantId, user.userId);
  }

  @Get('shifts/forecast-plan')
  getForecastPlan(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('segment') segment?: OperationShiftSegment,
    @Query('businessDate') businessDate?: string,
  ) {
    return this.shiftForecast.getPlan(restaurantId, user.userId, {
      segment,
      businessDate,
    });
  }

  @Get('routines')
  getRoutines(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.routines.get(restaurantId, user.userId);
  }

  @Put('routines')
  putRoutines(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PutOperationalRoutinesDto,
  ) {
    return this.routines.replace(restaurantId, user.userId, dto);
  }

  @Post('simulations/tactic')
  simulateTactic(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SimulateTacticDto,
  ) {
    return this.tacticSimulation.simulate(restaurantId, user.userId, dto);
  }

  // --- La Línea ---

  @Get('line')
  getLine(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('roleCode') roleCode?: string,
  ) {
    return this.line.getLine(restaurantId, user.userId, {
      roleCode: roleCode ?? user.role ?? undefined,
    });
  }

  @Get('timeline')
  getTimeline(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.timeline.getTimeline(restaurantId, user.userId);
  }

  @Post('intelligence-moves')
  routeIntelligenceMove(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RouteIntelligenceMoveDto,
  ) {
    return this.moveRouting.publishAndRoute(restaurantId, {
      preparationId: dto.preparationId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      situationType: dto.situationType,
      situationId: dto.situationId,
      target: {
        targetType: dto.target.targetType as
          | 'USER'
          | 'ROLE'
          | 'STATION'
          | 'RESPONSIBILITY',
        targetId: dto.target.targetId,
      },
      contextRef: dto.contextRef
        ? {
            type: dto.contextRef.type as
              | 'ORDER'
              | 'TABLE_SESSION'
              | 'TABLE'
              | 'CASH_REGISTER_SESSION'
              | 'DISH'
              | 'INVENTORY_ITEM'
              | 'RESERVATION'
              | 'DELIVERY'
              | 'SITUATION'
              | 'PREPARATION'
              | 'DAILY_OPERATION'
              | 'NONE',
            id: dto.contextRef.id,
            label: dto.contextRef.label,
            deepLink: dto.contextRef.deepLink,
          }
        : undefined,
      ackDeadlineMinutes: dto.ackDeadlineMinutes,
    });
  }

  // --- Stations ---

  @Get('stations')
  getStations(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stations.list(restaurantId, user.userId);
  }

  @Put('stations')
  putStations(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PutStationsDto,
  ) {
    return this.stations.replace(restaurantId, user.userId, dto.stations);
  }

  // --- Escalation config ---

  @Get('escalation-config')
  getEscalationConfig(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.escalationConfig.get(restaurantId, user.userId);
  }

  @Put('escalation-config')
  putEscalationConfig(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PutEscalationConfigDto,
  ) {
    return this.escalationConfig.replace(restaurantId, user.userId, dto);
  }

  // --- Coordinations ---

  @Get('shifts/:shiftId/coordinations')
  listCoordinations(
    @Param('restaurantId') restaurantId: string,
    @Param('shiftId') shiftId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.coordinations.listForShift(restaurantId, user.userId, shiftId);
  }

  @Post('coordinations')
  openCoordination(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: OpenCoordinationDto,
  ) {
    return this.coordinations.open(restaurantId, user.userId, dto);
  }

  @Post('coordinations/declare-86')
  declare86(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: Declare86Dto,
  ) {
    return this.coordinations.declare86(restaurantId, user.userId, dto);
  }

  @Post('coordinations/declare-incident')
  declareIncident(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: DeclareIncidentDto,
  ) {
    return this.coordinations.declareIncident(restaurantId, user.userId, dto);
  }

  @Post('coordinations/request-approval')
  requestApproval(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RequestApprovalDto,
  ) {
    return this.coordinations.requestApproval(restaurantId, user.userId, dto);
  }

  @Post('coordinations/help-request')
  helpRequest(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: HelpRequestDto,
  ) {
    return this.coordinations.requestHelp(restaurantId, user.userId, dto);
  }

  @Post('coordinations/:id/ack')
  ack(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.coordinations.acknowledge(restaurantId, user.userId, id);
  }

  @Post('coordinations/:id/resolve')
  resolve(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ResolveCoordinationDto,
  ) {
    return this.coordinations.resolve(restaurantId, user.userId, id, dto);
  }

  @Post('coordinations/:id/reject')
  reject(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RejectCoordinationDto,
  ) {
    return this.coordinations.reject(restaurantId, user.userId, id, dto);
  }

  @Post('coordinations/:id/escalate')
  escalate(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.coordinations.escalate(restaurantId, user.userId, id);
  }

  // --- Handoff ---

  @Get('handoffs/pending')
  pendingHandoff(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.handoffs.getPending(restaurantId, user.userId);
  }

  @Get('shifts/:shiftId/handoff-preview')
  handoffPreview(
    @Param('restaurantId') restaurantId: string,
    @Param('shiftId') shiftId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.handoffs.preview(restaurantId, user.userId, shiftId);
  }

  @Post('shifts/:shiftId/handoff/publish')
  publishHandoff(
    @Param('restaurantId') restaurantId: string,
    @Param('shiftId') shiftId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PublishHandoffDto,
  ) {
    return this.handoffs.publish(restaurantId, user.userId, shiftId, dto);
  }

  @Post('handoffs/:id/accept')
  acceptHandoff(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AcceptHandoffDto,
  ) {
    return this.handoffs.accept(restaurantId, user.userId, id, dto);
  }
}
