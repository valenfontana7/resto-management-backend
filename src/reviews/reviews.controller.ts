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
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  FeatureGuard,
  RequireFeature,
} from '../subscriptions/guards/feature.guard';

@Controller('restaurants/:restaurantId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /** Public: cliente deja una review */
  @Public()
  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(restaurantId, dto);
  }

  /** Public: reviews aprobadas de un restaurante */
  @Public()
  @Get()
  findPublic(
    @Param('restaurantId') restaurantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewsService.findByRestaurant(restaurantId, {
      approved: true,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /** Public: reviews de un plato */
  @Public()
  @Get('dish/:dishId')
  findByDish(
    @Param('dishId') dishId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
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
    @Param('restaurantId') restaurantId: string,
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
  getStats(@Param('restaurantId') restaurantId: string) {
    return this.reviewsService.getRestaurantStats(restaurantId);
  }

  /** Admin: aprobar review */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Patch(':reviewId/approve')
  approve(
    @Param('restaurantId') restaurantId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.reviewsService.approve(reviewId, restaurantId);
  }

  /** Admin: rechazar review */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Patch(':reviewId/reject')
  reject(
    @Param('restaurantId') restaurantId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.reviewsService.reject(reviewId, restaurantId);
  }

  /** Admin: eliminar review */
  @UseGuards(FeatureGuard)
  @RequireFeature('reviews')
  @Delete(':reviewId')
  remove(
    @Param('restaurantId') restaurantId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.reviewsService.delete(reviewId, restaurantId);
  }
}
