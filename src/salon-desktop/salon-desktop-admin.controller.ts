import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SalonDesktopFleetService } from './salon-desktop-fleet.service';

@ApiTags('Salon Desktop')
@Controller('api/super-admin/salon-desktop')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class SalonDesktopAdminController {
  constructor(private readonly fleet: SalonDesktopFleetService) {}

  @Get('fleet')
  @ApiOperation({
    summary:
      'Flota de terminales Bentoo Salón Desktop con heartbeat y versiones',
  })
  getFleet(
    @Query('staleMinutes') staleMinutes?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedStale = staleMinutes ? Number(staleMinutes) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;

    return this.fleet.getFleet({
      staleMinutes: Number.isFinite(parsedStale) ? parsedStale : undefined,
      search,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }
}
