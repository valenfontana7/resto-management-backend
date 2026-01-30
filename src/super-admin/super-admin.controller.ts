import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateRestaurantStatusDto } from './dto/update-restaurant-status.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('api/super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('restaurants')
  async getRestaurants(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('plan') plan?: string,
    @Query('cuisine') cuisine?: string,
    @Query('include') include?: string,
  ) {
    return this.superAdminService.getRestaurants(
      +page,
      +limit,
      search,
      status,
      plan,
      cuisine,
      include,
    );
  }

  @Get('restaurants/:id')
  async getRestaurantDetails(@Param('id') id: string) {
    return this.superAdminService.getRestaurantDetails(id);
  }

  @Patch('restaurants/:id')
  async updateRestaurant(
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantDto,
    @Request() req,
  ) {
    return this.superAdminService.updateRestaurant(id, dto, req.user.userId);
  }

  @Patch('restaurants/:id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantStatusDto,
    @Request() req,
  ) {
    return this.superAdminService.updateRestaurantStatus(
      id,
      dto,
      req.user.userId,
    );
  }

  @Patch('restaurants/:id/subscription')
  async updateSubscription(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @Request() req,
  ) {
    return this.superAdminService.updateSubscription(id, dto, req.user.userId);
  }

  @Get('stats')
  async getStats() {
    return this.superAdminService.getGlobalStats();
  }

  @Get('users')
  async getUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    return this.superAdminService.getUsers(
      search,
      role,
      isActive,
      +limit,
      +offset,
    );
  }

  @Post('users')
  async createUser(@Body() dto: CreateUserDto, @Request() req) {
    return this.superAdminService.createUser(dto, req.user.userId);
  }

  @Patch('users/:userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
    @Request() req,
  ) {
    return this.superAdminService.updateUser(userId, dto, req.user.userId);
  }

  @Get('roles')
  async getRoles() {
    return this.superAdminService.getRoles();
  }

  @Post('restaurants')
  async createRestaurant(@Body() dto: CreateRestaurantDto) {
    return this.superAdminService.createRestaurant(dto);
  }

  @Post('restaurants/:restaurantId/orders')
  async createManualOrder(
    @Param('restaurantId') restaurantId: string,
    @Body() createOrderDto: any,
    @Request() req,
  ) {
    return this.superAdminService.createManualOrder(
      restaurantId,
      createOrderDto,
      req.user.userId,
    );
  }

  @Get('restaurants/:restaurantId/orders')
  async getRestaurantOrders(
    @Param('restaurantId') restaurantId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.superAdminService.getRestaurantOrders(
      restaurantId,
      +page,
      +limit,
      status,
      dateFrom,
      dateTo,
    );
  }

  @Delete('restaurants/:id')
  async deleteRestaurant(@Param('id') id: string, @Request() req) {
    return this.superAdminService.deleteRestaurant(id, req.user.userId);
  }
}
