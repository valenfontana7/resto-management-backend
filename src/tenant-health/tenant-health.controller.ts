import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantHealthService } from './tenant-health.service';
import type { TenantHealthBand } from './tenant-health.types';

const HEALTH_BANDS: TenantHealthBand[] = [
  'healthy',
  'attention',
  'at_risk',
  'critical',
];

function parseBand(value?: string): TenantHealthBand | undefined {
  if (!value) return undefined;
  return HEALTH_BANDS.includes(value as TenantHealthBand)
    ? (value as TenantHealthBand)
    : undefined;
}

function parseSort(value?: string): 'score_asc' | 'score_desc' | undefined {
  if (value === 'score_asc' || value === 'score_desc') return value;
  return undefined;
}

@ApiTags('tenant-health')
@Controller('api/super-admin/tenant-health')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class TenantHealthController {
  constructor(private readonly tenantHealth: TenantHealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health 360 — score unificado por tenant' })
  list(
    @Query('limit') limit?: string,
    @Query('band') band?: string,
    @Query('sort') sort?: string,
  ) {
    const parsed = limit != null ? parseInt(limit, 10) : 100;
    return this.tenantHealth.getHealth360({
      limit: Number.isFinite(parsed) ? parsed : 100,
      band: parseBand(band),
      sort: parseSort(sort),
    });
  }

  @Get(':restaurantId')
  @ApiOperation({ summary: 'Health 360 de un restaurante' })
  getOne(@Param('restaurantId') restaurantId: string) {
    return this.tenantHealth.getTenantHealth(restaurantId);
  }
}
