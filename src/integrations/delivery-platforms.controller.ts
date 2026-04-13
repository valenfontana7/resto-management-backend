import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnershipService } from '../common/services/ownership.service';
import { DeliveryPlatformsService } from './services/delivery-platforms.service';
import {
  CreatePlatformDto,
  UpdatePlatformDto,
} from './dto/delivery-platform.dto';

@Controller('api/restaurants/:restaurantId/integrations/platforms')
@UseGuards(JwtAuthGuard)
export class DeliveryPlatformsController {
  constructor(
    private readonly platformsService: DeliveryPlatformsService,
    private readonly ownership: OwnershipService,
  ) {}

  @Get()
  async list(@Param('restaurantId') restaurantId: string, @Request() req) {
    await this.ownership.verifyUserBelongsToRestaurant(
      req.user.userId,
      restaurantId,
    );
    return this.platformsService.list(restaurantId);
  }

  @Post()
  async create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreatePlatformDto,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      req.user.userId,
      restaurantId,
    );
    return this.platformsService.create(restaurantId, dto);
  }

  @Patch(':platformId')
  async update(
    @Param('restaurantId') restaurantId: string,
    @Param('platformId') platformId: string,
    @Body() dto: UpdatePlatformDto,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      req.user.userId,
      restaurantId,
    );
    return this.platformsService.update(restaurantId, platformId, dto);
  }

  @Patch(':platformId/toggle')
  async toggle(
    @Param('restaurantId') restaurantId: string,
    @Param('platformId') platformId: string,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      req.user.userId,
      restaurantId,
    );
    return this.platformsService.toggle(restaurantId, platformId);
  }

  @Post(':platformId/regenerate-secret')
  async regenerateSecret(
    @Param('restaurantId') restaurantId: string,
    @Param('platformId') platformId: string,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      req.user.userId,
      restaurantId,
    );
    return this.platformsService.regenerateWebhookSecret(
      restaurantId,
      platformId,
    );
  }

  @Delete(':platformId')
  async delete(
    @Param('restaurantId') restaurantId: string,
    @Param('platformId') platformId: string,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      req.user.userId,
      restaurantId,
    );
    return this.platformsService.delete(restaurantId, platformId);
  }
}
