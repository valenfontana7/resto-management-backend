import {
  Controller,
  Get,
  Post,
  Patch,
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
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderFiltersDto,
} from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('orders')
@Controller('api/restaurants/:restaurantId')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Public endpoint para crear órdenes (desde el menú público)
  @Post('orders')
  @ApiOperation({ summary: 'Create a new order (public)' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  async create(
    @Param('restaurantId') restaurantId: string,
    @Body() createDto: CreateOrderDto,
  ) {
    return this.ordersService.create(restaurantId, createDto);
  }

  // Admin endpoints (requieren autenticación)
  @Get('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders for a restaurant (admin)' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async findAll(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query() filters: OrderFiltersDto,
  ) {
    const orders = await this.ordersService.findAll(
      restaurantId,
      user.userId,
      filters,
    );
    return {
      orders,
      count: orders.length,
    };
  }

  @Get('stats/today')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get today statistics for a restaurant (admin)' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  async getTodayStats(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.getTodayStats(restaurantId, user.userId);
  }

  @Get('stats/top-dishes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get top selling dishes (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Top dishes retrieved successfully',
  })
  async getTopDishes(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('period') period?: string,
  ) {
    return this.ordersService.getTopDishes(
      restaurantId,
      user.userId,
      period || 'today',
    );
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  async findOne(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.findOne(id, restaurantId, user.userId);
  }

  @Patch('orders/:id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order status (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  async updateStatus(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() updateDto: UpdateOrderStatusDto,
  ) {
    const order = await this.ordersService.updateStatus(
      id,
      restaurantId,
      user.userId,
      updateDto,
    );
    return { order };
  }
}
