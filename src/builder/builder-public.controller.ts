import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { BuilderService } from './builder.service';
import { BuilderPublishedConfigEnvelopeDto } from './dto/builder-config.dto';

@ApiTags('Builder (Public)')
@Controller('api/public/restaurants/:restaurantId/builder')
export class BuilderPublicController {
  constructor(private readonly builderService: BuilderService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get published builder configuration (public)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Published configuration retrieved',
    type: BuilderPublishedConfigEnvelopeDto,
  })
  @ApiResponse({ status: 404, description: 'No published configuration found' })
  async getPublishedConfig(@Param('restaurantId') restaurantId: string) {
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
