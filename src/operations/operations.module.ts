import { Module, forwardRef } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { BusinessMemoryModule } from '../business-memory/business-memory.module';
import { OperationsController } from './operations.controller';
import { ShiftService } from './services/shift.service';
import { CoordinationService } from './services/coordination.service';
import { HandoffService } from './services/handoff.service';
import { LineProjectionService } from './services/line-projection.service';
import { EpisodeLoggingService } from './services/episode-logging.service';
import { CoordinationPolicyService } from './services/coordination-policy.service';
import { EscalationService } from './services/escalation.service';
import { ReadyTimeoutMonitorService } from './services/ready-timeout-monitor.service';
import { StationsService } from './services/stations.service';
import { ChecklistTaskMaterializerService } from './services/checklist-task-materializer.service';
import { EscalationConfigService } from './services/escalation-config.service';
import { CoordinationDigestService } from './services/coordination-digest.service';
import { TimelineProjectionService } from './services/timeline-projection.service';
import { MoveRoutingService } from './services/move-routing.service';
import { ResolutionMemoryService } from './services/resolution-memory.service';
import { ShiftRecapService } from './services/shift-recap.service';
import { ShiftForecastService } from './services/shift-forecast.service';
import { TacticBenchmarkService } from './services/tactic-benchmark.service';
import { TacticSimulationService } from './services/tactic-simulation.service';
import { OperationalRoutineService } from './services/operational-routine.service';

@Module({
  imports: [
    CommonModule,
    BusinessMemoryModule,
    forwardRef(() => BusinessEventsModule),
  ],
  controllers: [OperationsController],
  providers: [
    ShiftService,
    CoordinationService,
    HandoffService,
    LineProjectionService,
    EpisodeLoggingService,
    CoordinationPolicyService,
    EscalationService,
    ReadyTimeoutMonitorService,
    StationsService,
    EscalationConfigService,
    CoordinationDigestService,
    ChecklistTaskMaterializerService,
    TimelineProjectionService,
    MoveRoutingService,
    ResolutionMemoryService,
    ShiftRecapService,
    ShiftForecastService,
    TacticBenchmarkService,
    TacticSimulationService,
    OperationalRoutineService,
  ],
  exports: [
    ShiftService,
    CoordinationService,
    HandoffService,
    LineProjectionService,
    EpisodeLoggingService,
    StationsService,
    EscalationConfigService,
    CoordinationDigestService,
    MoveRoutingService,
    ResolutionMemoryService,
    ShiftRecapService,
    ShiftForecastService,
    TacticBenchmarkService,
    TacticSimulationService,
    OperationalRoutineService,
  ],
})
export class OperationsModule {}
