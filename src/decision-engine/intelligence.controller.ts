import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommercialRelationStage } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DecisionEngineOrchestratorService } from './decision-engine-orchestrator.service';
import { BatchSnapshotsDto } from './dto/batch-snapshots.dto';
import { RESTAURANT_INTELLIGENCE_BUNDLE_VERSION } from './types/restaurant-intelligence-bundle.v1';

@ApiTags('Intelligence')
@Controller('api/super-admin/intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class IntelligenceController {
  constructor(
    private readonly orchestrator: DecisionEngineOrchestratorService,
  ) {}

  @Get('snapshot/:restaurantId')
  async getSnapshot(@Param('restaurantId') restaurantId: string) {
    const bundle = await this.orchestrator.getSnapshot(restaurantId);
    if (!bundle) {
      throw new NotFoundException(
        `Sin snapshot de inteligencia para ${restaurantId}. Ejecutá POST evaluate primero.`,
      );
    }
    return bundle;
  }

  @Post('snapshots')
  async getSnapshotsBatch(@Body() body: BatchSnapshotsDto) {
    const lifecycleMap = new Map<string, CommercialRelationStage>();

    if (body.items?.length) {
      for (const item of body.items) {
        lifecycleMap.set(item.restaurantId, item.lifecycleStage ?? 'CLIENT');
      }
    } else {
      for (const id of body.restaurantIds ?? []) {
        lifecycleMap.set(id, 'CLIENT');
      }
    }

    const restaurantIds = body.items?.length
      ? body.items.map((item) => item.restaurantId)
      : (body.restaurantIds ?? []);

    const bundles = await this.orchestrator.getSnapshotsBatch(
      restaurantIds,
      lifecycleMap,
      {
        evaluateIfMissing: body.evaluateIfMissing ?? true,
        refreshStale: body.refreshStale ?? false,
      },
    );

    return {
      contractVersion: RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
      snapshots: Object.fromEntries(bundles),
    };
  }

  @Post('evaluate/:restaurantId')
  async evaluate(@Param('restaurantId') restaurantId: string) {
    return this.orchestrator.evaluateRestaurant(restaurantId);
  }
}
