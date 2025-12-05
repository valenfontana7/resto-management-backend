import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  UpdateBusinessHoursDto,
  UpdateBrandingDto,
  UpdatePaymentMethodsDto,
  UpdateDeliveryZonesDto,
  InviteUserDto,
  UpdateUserRoleDto,
} from './dto/restaurant-settings.dto';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';

@ApiTags('Restaurants')
@Controller('api/restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get restaurant by slug (public)' })
  @ApiParam({ name: 'slug', description: 'The slug of the restaurant' })
  @ApiResponse({ status: 200, description: 'Return the restaurant.' })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  async getBySlug(@Param('slug') slug: string) {
    const restaurant = await this.restaurantsService.findBySlug(slug);
    return { restaurant };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user restaurant' })
  @ApiResponse({ status: 200, description: 'Return the restaurant.' })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  async getMyRestaurant(@CurrentUser() user: RequestUser) {
    if (!user.restaurantId) {
      throw new ForbiddenException('User does not have a restaurant');
    }
    const restaurant = await this.restaurantsService.findById(
      user.restaurantId,
    );
    return { restaurant };
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new restaurant' })
  @ApiBody({
    schema: { example: { name: 'My Restaurant', address: '123 Main St' } },
  })
  @ApiResponse({
    status: 201,
    description: 'The restaurant has been successfully created.',
  })
  async create(@Body() createDto: any, @CurrentUser() user: RequestUser) {
    const restaurant = await this.restaurantsService.create(createDto);

    // Associate restaurant with user
    await this.restaurantsService.associateUserWithRestaurant(
      user.userId,
      restaurant.id,
    );

    return {
      restaurant,
      slug: restaurant.slug,
      url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${restaurant.slug}`,
    };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update restaurant configuration' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @ApiBody({ type: UpdateRestaurantSettingsDto })
  @ApiResponse({
    status: 200,
    description: 'The restaurant has been successfully updated.',
  })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateRestaurantSettingsDto,
    @CurrentUser() user: RequestUser,
  ) {
    // Verify ownership
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only update your own restaurant');
    }

    console.log('🔵 Controller received update request:', {
      id,
      hasBranding: !!updateDto.branding,
      brandingKeys: updateDto.branding ? Object.keys(updateDto.branding) : [],
      colorsKeys: updateDto.branding?.colors ? Object.keys(updateDto.branding.colors) : [],
    });

    const restaurant = await this.restaurantsService.update(id, updateDto);
    
    console.log('🟢 Controller returning restaurant:', {
      id: restaurant.id,
      hasBranding: !!restaurant.branding,
      brandingType: typeof restaurant.branding,
      branding: restaurant.branding,
    });

    return { restaurant };
  }

  @ApiOperation({ summary: 'Update restaurant hours' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @ApiResponse({
    status: 200,
    description: 'The restaurant hours have been successfully updated.',
  })
  @Put(':id/hours')
  @ApiBearerAuth()
  async updateHours(
    @Param('id') id: string,
    @Body() dto: UpdateBusinessHoursDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only update your own restaurant');
    }

    const updatedHours = await this.restaurantsService.updateHours(
      id,
      dto.hours,
    );
    return { success: true, hours: updatedHours };
  }

  @ApiOperation({ summary: 'Update restaurant branding' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Put(':id/branding')
  @ApiBearerAuth()
  async updateBranding(
    @Param('id') id: string,
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only update your own restaurant');
    }

    const branding = await this.restaurantsService.updateBranding(id, dto);
    return { success: true, branding };
  }

  @ApiOperation({ summary: 'Update payment methods' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Put(':id/payment-methods')
  @ApiBearerAuth()
  async updatePaymentMethods(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodsDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only update your own restaurant');
    }

    const paymentMethods = await this.restaurantsService.updatePaymentMethods(
      id,
      dto,
    );
    return { success: true, paymentMethods, updatedAt: new Date() };
  }

  @ApiOperation({ summary: 'Update delivery zones' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Put(':id/delivery-zones')
  @ApiBearerAuth()
  async updateDeliveryZones(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryZonesDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only update your own restaurant');
    }

    const zones = await this.restaurantsService.updateDeliveryZones(id, dto);
    return { success: true, deliveryZones: zones, updatedAt: new Date() };
  }

  @ApiOperation({ summary: 'Get available roles' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Get(':id/roles')
  @ApiBearerAuth()
  async getRoles(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only access your own restaurant');
    }

    const roles = await this.restaurantsService.getRoles(id);
    return { success: true, roles };
  }

  @ApiOperation({ summary: 'Get restaurant users' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Get(':id/users')
  @ApiBearerAuth()
  async getRestaurantUsers(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only access your own restaurant');
    }

    const users = await this.restaurantsService.getRestaurantUsers(id);
    return { success: true, users };
  }

  @ApiOperation({ summary: 'Invite user to restaurant' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Post(':id/users')
  @ApiBearerAuth()
  async inviteUser(
    @Param('id') id: string,
    @Body() dto: InviteUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    console.log('Received invite user DTO:', dto);

    if (user.restaurantId !== id) {
      throw new ForbiddenException(
        'You can only invite users to your own restaurant',
      );
    }

    // Support both roleId (new) and role name (legacy)
    const newUser = await this.restaurantsService.inviteUser(id, {
      email: dto.email,
      roleId: dto.roleId,
      roleName: dto.role,
      name: dto.name,
    });

    return { success: true, user: newUser };
  }

  @ApiOperation({ summary: 'Update user role or status' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @ApiParam({ name: 'userId', description: 'The id of the user' })
  @Put(':id/users/:userId')
  @ApiBearerAuth()
  async updateUserRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException(
        'You can only update users in your own restaurant',
      );
    }

    const updatedUser = await this.restaurantsService.updateUserRole(
      id,
      userId,
      {
        roleId: dto.roleId,
        isActive: dto.isActive,
      },
    );

    return { success: true, user: updatedUser };
  }

  @ApiOperation({ summary: 'Remove user from restaurant' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @ApiParam({ name: 'userId', description: 'The id of the user' })
  @Delete(':id/users/:userId')
  @ApiBearerAuth()
  async removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException(
        'You can only remove users from your own restaurant',
      );
    }

    // Only owner can remove users
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can remove users');
    }

    return this.restaurantsService.removeUser(id, userId);
  }
}
