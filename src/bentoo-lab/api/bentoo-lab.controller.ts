import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { listLabScenarios } from '../scenarios/scenario-registry';
import { SimulationRuntimeService } from '../runtime/simulation-runtime.service';
import { SimulationTimelineService } from '../timeline/simulation-timeline.service';
import { CreateBentooLabRunDto } from './bentoo-lab.dto';

@Controller('api/internal/lab')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class BentooLabController {
  constructor(
    private readonly runtime: SimulationRuntimeService,
    private readonly timeline: SimulationTimelineService,
  ) {}

  @Get('scenarios')
  listScenarios() {
    return listLabScenarios().map((scenario) => ({
      id: scenario.id,
      version: scenario.version,
      label: scenario.label,
      durationMinutes: scenario.durationMinutes,
      defaultSpeed: scenario.defaultSpeed,
    }));
  }

  @Post('runs')
  createRun(@Body() dto: CreateBentooLabRunDto) {
    return this.runtime.createRun({
      scenarioId: dto.scenarioId,
      repetitionKey: dto.repetitionKey,
      simulatedStartAt: dto.simulatedStartAt
        ? new Date(dto.simulatedStartAt)
        : undefined,
      incidentCodes: dto.incidentCodes,
      labProfile: dto.labProfile,
    });
  }

  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.runtime.getRun(runId);
  }

  @Post('runs/:runId/start')
  start(@Param('runId') runId: string) {
    return this.runtime.start(runId);
  }

  @Post('runs/:runId/pause')
  pause(@Param('runId') runId: string) {
    return this.runtime.pause(runId);
  }

  @Post('runs/:runId/resume')
  resume(@Param('runId') runId: string) {
    return this.runtime.resume(runId);
  }

  @Post('runs/:runId/stop')
  stop(@Param('runId') runId: string) {
    return this.runtime.stop(runId);
  }

  @Delete('runs/:runId')
  async cleanup(@Param('runId') runId: string) {
    await this.runtime.cleanup(runId, false);
    return { ok: true };
  }

  @Get('runs/:runId/timeline')
  timelineForRun(@Param('runId') runId: string) {
    return this.timeline.list(runId);
  }

  @Get('runs/:runId/invariants')
  async invariants(@Param('runId') runId: string) {
    const run = await this.runtime.getRun(runId);
    return run.invariantResults;
  }

  @Post('runs/:runId/open-as-manager')
  openAsManager(@Param('runId') runId: string) {
    return this.runtime.openAsRole(runId, 'manager');
  }

  @Post('runs/:runId/open-as/:role')
  openAsRole(@Param('runId') runId: string, @Param('role') role: string) {
    return this.runtime.openAsRole(runId, role);
  }
}
