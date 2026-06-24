import { Controller, Get, Param, NotFoundException, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';
import { BuilderService } from './builder.service';
import { BuilderPublishedConfigEnvelopeDto } from './dto/builder-config.dto';

@ApiTags('Builder (Public)')
@Controller('api/public/restaurants/:restaurantId/builder')
export class BuilderPublicController {
  constructor(
    private readonly builderService: BuilderService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Get('config')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Get published builder configuration (public)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Published configuration retrieved',
    type: BuilderPublishedConfigEnvelopeDto,
  })
  @ApiResponse({ status: 404, description: 'No published configuration found' })
  async getPublishedConfig(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'public_read',
      restaurantId,
    });

    const config = await this.builderService.getPublishedConfig(restaurantId);

    if (!config) {
      throw new NotFoundException(
        'No published configuration found for this restaurant',
      );
    }

    return {
      success: true,
      data: config,
    };
  }
}
