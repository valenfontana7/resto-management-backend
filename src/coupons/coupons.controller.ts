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
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  CouponFiltersDto,
  ValidateCouponDto,
  CouponStatsDto,
} from './dto/coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { OwnershipService } from '../common/services/ownership.service';

@ApiTags('coupons')
@Controller('api/restaurants/:restaurantId/coupons')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CouponsController {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly ownership: OwnershipService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new coupon' })
  @ApiResponse({
    status: 201,
    description: 'Coupon created successfully',
  })
  async create(
    @Param('restaurantId') restaurantId: string,
    @Body() createDto: CreateCouponDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.couponsService.create(restaurantId, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all coupons for a restaurant' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'code', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Coupons retrieved successfully',
  })
  async findAll(
    @Param('restaurantId') restaurantId: string,
    @Query() filters: CouponFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.couponsService.findAll(restaurantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get coupon statistics' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStats(
    @Param('restaurantId') restaurantId: string,
    @Query() statsDto: CouponStatsDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.couponsService.getStats(restaurantId, statsDto.period);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon by ID' })
  @ApiResponse({
    status: 200,
    description: 'Coupon retrieved successfully',
  })
  async findOne(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.couponsService.findOne(id, restaurantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update coupon' })
  @ApiResponse({
    status: 200,
    description: 'Coupon updated successfully',
  })
  async update(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @Body() updateDto: UpdateCouponDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.couponsService.update(id, restaurantId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete coupon' })
  @ApiResponse({
    status: 200,
    description: 'Coupon deleted successfully',
  })
  async delete(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.couponsService.delete(id, restaurantId);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate coupon' })
  @ApiResponse({
    status: 200,
    description: 'Coupon validation result',
  })
  async validate(
    @Param('restaurantId') restaurantId: string,
    @Body() validateDto: ValidateCouponDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.couponsService.validate(restaurantId, validateDto);
  }
}
