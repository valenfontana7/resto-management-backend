import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { BusinessHealthService } from './business-health.service';
import { SendWinBackEmailDto } from './dto/win-back.dto';

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
