import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  FeatureGuard,
  RequireFeature,
} from '../subscriptions/guards/feature.guard';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';

@Controller('api/restaurants/:restaurantId/reviews')
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  /** Public: cliente deja una review */
  @Public()
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  async create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateReviewDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('reviews.create', { restaurantId });
      await this.botDefense.applyBotDelayMs();
      return this.reviewsService.buildDecoyReview(restaurantId, dto);
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'review',
      restaurantId,
    });

    return this.reviewsService.create(restaurantId, dto);
  }

  /** Public: reviews aprobadas de un restaurante */
  @Public()
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async findPublic(
    @Param('restaurantId') restaurantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req as Request),
      scope: 'public_read',
      restaurantId,
    });

    return this.reviewsService.findByRestaurant(restaurantId, {
      approved: true,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /** Public: reviews de un plato */
  @Public()
  @Get('dish/:dishId')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async findByDish(
    @Param('restaurantId') restaurantId: string,
    @Param('dishId') dishId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req as Request),
      scope: 'public_read',
      restaurantId,
    });

    return this.reviewsService.findByDish(
      dishId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  /** Admin: todas las reviews (incluye no aprobadas) */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Get('admin')
  findAll(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('approved') approved?: string,
  ) {
    return this.reviewsService.findByRestaurant(restaurantId, {
      approved: approved !== undefined ? approved === 'true' : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /** Admin: stats de reviews */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Get('stats')
  getStats(@VerifyRestaurantAccess('restaurantId') restaurantId: string) {
    return this.reviewsService.getRestaurantStats(restaurantId);
  }

  /** Admin: aprobar review */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Patch(':reviewId/approve')
  approve(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.reviewsService.approve(reviewId, restaurantId);
  }

  /** Admin: rechazar review */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Patch(':reviewId/reject')
  reject(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.reviewsService.reject(reviewId, restaurantId);
  }

  /** Admin: eliminar review */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Delete(':reviewId')
  remove(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.reviewsService.delete(reviewId, restaurantId);
  }
}
