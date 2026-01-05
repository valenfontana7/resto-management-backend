import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RestaurantsService } from './restaurants.service';
import { AuthService } from '../auth/auth.service';
import type { Response, Request } from 'express';
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
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get restaurant by slug (public)' })
  @ApiParam({ name: 'slug', description: 'The slug of the restaurant' })
  @ApiResponse({ status: 200, description: 'Return the restaurant.' })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  async getBySlug(
    @Param('slug') slug: string,
    @Query('increment') increment?: string,
    @Req() req?: Request,
  ) {
    const restaurant = await this.restaurantsService.findBySlug(slug);
    try {
      if (restaurant?.id) {
        const meta = {
          ip:
            (req?.headers['x-forwarded-for'] as string) ||
            req?.socket?.remoteAddress ||
            null,
          userAgent: req?.headers['user-agent'] || null,
          referrer:
            (req?.headers['referer'] as string) ||
            (req?.headers['referrer'] as string) ||
            null,
        };
        // Only skip increment when client explicitly requests it via query
        // param `increment=false`. Do NOT rely on Authorization header here.
        const explicitNoIncrement =
          typeof increment === 'string' && increment.toLowerCase() === 'false';
        if (!explicitNoIncrement) {
          this.restaurantsService.logVisit(restaurant.id, meta).catch(() => {});
        }
      }
    } catch (e) {
      // ignore analytics errors for public route
    }

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

  @ApiOperation({ summary: 'Get restaurant analytics (visits count)' })
  @ApiBearerAuth()
  @Get(':id/analytics')
  async getAnalytics(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!user || user.restaurantId !== id) {
      throw new ForbiddenException(
        'You can only access your own restaurant analytics',
      );
    }

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const count = await this.restaurantsService.getVisitsCount(
      id,
      fromDate,
      toDate,
    );
    return { success: true, count };
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
    // Support frontend onboarding payloads under `onboardingData` or legacy flat payload
    let payload = createDto;
    if (createDto?.onboardingData) {
      const d = createDto.onboardingData;
      const businessInfo = d.businessInfo || {};
      const contact = d.contact || {};
      const paymentMethods = d.paymentMethods || {};

      payload = {
        businessInfo: {
          name: businessInfo.name || businessInfo.restaurantName || null,
          type: businessInfo.type || businessInfo.businessType || null,
          cuisineTypes: businessInfo.cuisineTypes || businessInfo.cuisine || [],
          description: businessInfo.description || null,
          logo: businessInfo.logo || null,
        },
        contact: {
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
          city: contact.city,
          country: contact.country,
          postalCode: contact.postalCode,
        },
        branding: {},
        businessRules: {
          orders: {
            minOrderAmount:
              paymentMethods.minOrder || paymentMethods.minOrderAmount || 1000,
            orderLeadTime: (d.estimatedTime && parseInt(d.estimatedTime)) || 30,
          },
        },
        features: {},
        hours: d.hours || {},
        slug: contact.customSlug || undefined,
      };
    }

    const restaurant = await this.restaurantsService.create(payload);

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
    try {
      // Verify ownership
      if (user.restaurantId !== id) {
        throw new ForbiddenException('You can only update your own restaurant');
      }

      console.log('🔵 Controller received update request:', {
        id,
        payload: updateDto,
        hasBranding: !!updateDto.branding,
        brandingKeys: updateDto.branding ? Object.keys(updateDto.branding) : [],
        colorsKeys: updateDto.branding?.colors
          ? Object.keys(updateDto.branding.colors)
          : [],
      });

      const restaurant = await this.restaurantsService.update(id, updateDto);

      console.log('🟢 Controller returning restaurant:', {
        id: restaurant.id,
        hasBranding: !!restaurant.branding,
        brandingType: typeof restaurant.branding,
        branding: restaurant.branding,
      });

      return { restaurant };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      const stack = error instanceof Error ? error.stack : undefined;

      console.error('❌ Error updating restaurant:', {
        id,
        error: message,
        stack,
        payload: updateDto,
      });
      throw error;
    }
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

  @ApiOperation({ summary: 'Delete restaurant asset (logo, banner, ...)' })
  @Delete(':id/assets')
  @ApiBearerAuth()
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Asset type (e.g., banner, logo) as query parameter',
  })
  async deleteAsset(
    @Param('id') id: string,
    @Body() body: { type?: string },
    @CurrentUser() user: RequestUser,
    @Query('type') queryType?: string,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only modify your own restaurant');
    }

    const type = body?.type ?? queryType;

    if (!type) {
      throw new BadRequestException('Asset type is required');
    }

    const result = await this.restaurantsService.deleteAsset(id, type);
    return { success: true, result };
  }

  @ApiOperation({
    summary: 'Create a presigned upload URL for a restaurant asset',
  })
  @Get(':id/assets/presign')
  @ApiBearerAuth()
  @ApiQuery({
    name: 'type',
    required: true,
    description: 'Asset type (e.g., banner, logo)',
  })
  @ApiQuery({
    name: 'contentType',
    required: false,
    description: 'MIME type (e.g., image/png)',
  })
  @ApiQuery({
    name: 'filename',
    required: false,
    description: 'Original filename (used to infer extension)',
  })
  async presignAssetUpload(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('type') type: string,
    @Query('contentType') contentType?: string,
    @Query('filename') filename?: string,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only modify your own restaurant');
    }

    if (!type) {
      throw new BadRequestException('Asset type is required');
    }

    const result = await this.restaurantsService.presignAssetUpload(id, type, {
      contentType,
      filename,
    });

    return { success: true, result };
  }

  @ApiOperation({ summary: 'Upload restaurant asset (logo, banner, ...)' })
  @Post(':id/assets')
  @ApiBearerAuth()
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Asset type (e.g., banner, logo) as query parameter',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string' },
      },
    },
  })
  async uploadAsset(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: string },
    @CurrentUser() user: RequestUser,
    @Query('type') queryType?: string,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only modify your own restaurant');
    }

    const type = body?.type ?? queryType;
    if (!type) {
      throw new BadRequestException('Asset type is required');
    }

    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.restaurantsService.saveUploadedAsset(
      id,
      file,
      type,
    );

    return { success: true, result };
  }

  @ApiOperation({ summary: 'Upload restaurant logo (binary)' })
  @Post(':id/logo')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        logo: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only modify your own restaurant');
    }

    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.restaurantsService.saveUploadedAsset(
      id,
      file,
      'logo',
    );

    return { success: true, result };
  }

  @ApiOperation({ summary: 'Delete restaurant (soft)' })
  @Delete(':id')
  @ApiBearerAuth()
  async deleteRestaurant(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only delete your own restaurant');
    }

    // Only owner allowed
    // Allow both OWNER and Admin roles to delete the restaurant
    const allowed = ['OWNER', 'Owner', 'owner', 'Admin', 'admin'];
    if (!user.role || !allowed.includes(user.role)) {
      throw new ForbiddenException(
        'Only the owner or admin can delete the restaurant',
      );
    }

    const result = await this.restaurantsService.deleteRestaurant(
      id,
      user.userId,
    );

    // Issue a fresh token for the performing user (now disassociated)
    const authResp = await this.authService.createAuthResponseForUserId(
      user.userId,
    );

    // Set cookie so frontend receives new auth-token automatically
    res.cookie('auth-token', authResp.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      result,
      auth: { token: authResp.token, user: authResp.user },
    };
  }
}
