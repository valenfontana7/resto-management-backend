import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsQueryDto, TopItemsQueryDto } from './dto/analytics.dto';

@Controller('api/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('restaurant/:restaurantId/sales')
  async getSales(
    @Param('restaurantId') restaurantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getSales(
      restaurantId,
      query.period,
      query.startDate,
      query.endDate,
    );
  }

  @Get('restaurant/:restaurantId/categories')
  async getCategoryBreakdown(
    @Param('restaurantId') restaurantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getCategoryBreakdown(
      restaurantId,
      query.period,
      query.startDate,
      query.endDate,
    );
  }

  @Get('restaurant/:restaurantId/hourly')
  async getHourlyData(
    @Param('restaurantId') restaurantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getHourlyData(
      restaurantId,
      query.period,
      query.startDate,
      query.endDate,
    );
  }

  @Get('restaurant/:restaurantId/top-customers')
  async getTopCustomers(
    @Param('restaurantId') restaurantId: string,
    @Query() query: TopItemsQueryDto,
  ) {
    return this.analyticsService.getTopCustomers(
      restaurantId,
      query.period,
      query.limit || 10,
      query.startDate,
      query.endDate,
    );
  }

  @Get('restaurant/:restaurantId/performance')
  async getPerformance(
    @Param('restaurantId') restaurantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getPerformance(
      restaurantId,
      query.period,
      query.startDate,
      query.endDate,
    );
  }

  @Get('restaurant/:restaurantId/comparison')
  async getComparison(
    @Param('restaurantId') restaurantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getComparison(
      restaurantId,
      query.period,
      query.startDate,
      query.endDate,
    );
  }

  @Get('restaurant/:restaurantId/top-dishes')
  async getTopDishes(
    @Param('restaurantId') restaurantId: string,
    @Query() query: TopItemsQueryDto,
  ) {
    return this.analyticsService.getTopDishes(
      restaurantId,
      query.period,
      query.limit || 10,
      query.startDate,
      query.endDate,
    );
  }

  @Get('restaurant/:restaurantId/revenue-breakdown')
  async getRevenueBreakdown(
    @Param('restaurantId') restaurantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getRevenueBreakdown(
      restaurantId,
      query.period,
      query.startDate,
      query.endDate,
    );
  }
}
