import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { BusinessHealthService } from './business-health.service';
import { SendWinBackEmailDto } from './dto/win-back.dto';
import { UpdateGrowthSettingsDto } from './dto/growth-settings.dto';
import { UpdateInventorySettingsDto } from './dto/inventory-settings.dto';

@Controller('api/analytics/restaurant/:restaurantId/business-health')
@UseGuards(JwtAuthGuard)
export class BusinessHealthController {
  constructor(private readonly businessHealth: BusinessHealthService) {}

  @Get()
  getDashboard(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.businessHealth.getDashboard(restaurantId, user.userId);
  }

  @Get('insights-summary')
  getInsightsSummary(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.businessHealth.getInsightsSummary(restaurantId, user.userId);
  }

  @Get('snapshots')
  getSnapshots(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? Number.parseInt(days, 10) : 30;
    return this.businessHealth.getSnapshotHistory(
      restaurantId,
      user.userId,
      Number.isFinite(parsedDays) ? parsedDays : 30,
    );
  }

  @Patch('growth-settings')
  updateGrowthSettings(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateGrowthSettingsDto,
  ) {
    return this.businessHealth.updateGrowthSettings(
      restaurantId,
      user.userId,
      dto,
    );
  }

  @Patch('inventory-settings')
  updateInventorySettings(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateInventorySettingsDto,
  ) {
    return this.businessHealth.updateInventorySettings(
      restaurantId,
      user.userId,
      dto,
    );
  }

  @Post('win-back')
  sendWinBack(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SendWinBackEmailDto,
  ) {
    return this.businessHealth.sendWinBackEmails(
      restaurantId,
      user.userId,
      dto,
    );
  }

  @Get('export-pdf')
  async exportPdf(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const buffer = await this.businessHealth.exportPdf(
      restaurantId,
      user.userId,
    );
    const filename = `salud-negocio-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
