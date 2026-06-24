import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DishesService, DishFilters } from './dishes.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { PublicWriteAbuseService } from '../../common/services/public-write-abuse.service';
import { getClientIp } from '../../common/utils/client-ip.util';
import {
  CreateDishDto,
  UpdateDishDto,
  ToggleAvailabilityDto,
} from './dto/dish.dto';

@ApiTags('Menu - Dishes')
@Controller()
export class DishesController {
  constructor(
    private dishesService: DishesService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Public()
  @Get('api/restaurants/:restaurantId/dishes/public')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Get all dishes (public)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiResponse({ status: 200, description: 'Dishes retrieved' })
  async getDishesPublic(
    @Param('restaurantId') restaurantId: string,
    @Query('categoryId') categoryId: string | undefined,
    @Req() req: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'public_read',
      restaurantId,
    });

    const filters: DishFilters = {
      categoryId,
      available: true, // Solo platos disponibles para público
    };

    return this.dishesService.findAllPublic(restaurantId, filters);
  }

  @Get('api/restaurants/:restaurantId/dishes')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all dishes (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'available', required: false, type: Boolean })
  @ApiQuery({ name: 'featured', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'Dishes retrieved' })
  async getDishes(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('categoryId') categoryId?: string,
    @Query('available') available?: string,
    @Query('featured') featured?: string,
    @Query('search') search?: string,
  ) {
    const filters: DishFilters = {
      categoryId,
      available:
        available === 'true' ? true : available === 'false' ? false : undefined,
      featured:
        featured === 'true' ? true : featured === 'false' ? false : undefined,
      search,
    };

    return this.dishesService.findAll(restaurantId, user.userId, filters);
  }

  @Post('api/restaurants/:restaurantId/dishes')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new dish (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiResponse({ status: 201, description: 'Dish created' })
  async createDish(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateDishDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dishesService.create(restaurantId, user.userId, dto);
  }

  @Patch('api/restaurants/:restaurantId/dishes/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update dish (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Dish updated' })
  async updateDish(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDishDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dishesService.update(id, user.userId, dto);
  }

  @Delete('api/restaurants/:restaurantId/dishes/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete dish (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204, description: 'Dish deleted' })
  async deleteDish(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.dishesService.delete(id, user.userId);
  }

  @Patch('api/restaurants/:restaurantId/dishes/:id/availability')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle dish availability (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  async toggleAvailability(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: ToggleAvailabilityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dishesService.toggleAvailability(
      id,
      user.userId,
      dto.isAvailable,
    );
  }
}
