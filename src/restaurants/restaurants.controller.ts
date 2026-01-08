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
  VerifyRestaurantAccess,
  VerifyRestaurantRole,
} from '../common/decorators/verify-restaurant-access.decorator';
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
import { RestaurantUsersService } from './services/restaurant-users.service';
import { RestaurantBrandingService } from './services/restaurant-branding.service';
import { RestaurantSettingsService } from './services/restaurant-settings.service';
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
    private readonly usersService: RestaurantUsersService,
    private readonly brandingService: RestaurantBrandingService,
    private readonly settingsService: RestaurantSettingsService,
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
          this.settingsService.logVisit(restaurant.id, meta).catch(() => {});
        }
      }
    } catch {
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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const count = await this.restaurantsService.getVisitsCount(
      restaurantId,
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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() updateDto: UpdateRestaurantSettingsDto,
  ) {
    try {
      console.log('🔵 Controller received update request:', {
        id: restaurantId,
        payload: updateDto,
        hasBranding: !!updateDto.branding,
        brandingKeys: updateDto.branding ? Object.keys(updateDto.branding) : [],
        colorsKeys: updateDto.branding?.colors
          ? Object.keys(updateDto.branding.colors)
          : [],
      });

      const restaurant = await this.restaurantsService.update(
        restaurantId,
        updateDto,
      );

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
        id: restaurantId,
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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: UpdateBusinessHoursDto,
  ) {
    const updatedHours = await this.settingsService.updateHours(
      restaurantId,
      dto.hours,
    );
    return { success: true, hours: updatedHours };
  }

  @ApiOperation({ summary: 'Update restaurant branding' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Put(':id/branding')
  @ApiBearerAuth()
  async updateBranding(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: UpdateBrandingDto,
  ) {
    const branding = await this.brandingService.updateBranding(
      restaurantId,
      dto,
    );
    return { success: true, branding };
  }

  @ApiOperation({ summary: 'Update payment methods' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Put(':id/payment-methods')
  @ApiBearerAuth()
  async updatePaymentMethods(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: UpdatePaymentMethodsDto,
  ) {
    const paymentMethods = await this.settingsService.updatePaymentMethods(
      restaurantId,
      dto,
    );
    return { success: true, paymentMethods, updatedAt: new Date() };
  }

  @ApiOperation({ summary: 'Update delivery zones' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Put(':id/delivery-zones')
  @ApiBearerAuth()
  async updateDeliveryZones(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: UpdateDeliveryZonesDto,
  ) {
    const zones = await this.settingsService.updateDeliveryZones(
      restaurantId,
      dto,
    );
    return { success: true, deliveryZones: zones, updatedAt: new Date() };
  }

  @ApiOperation({ summary: 'Get available roles' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Get(':id/roles')
  @ApiBearerAuth()
  async getRoles(@VerifyRestaurantAccess('id') restaurantId: string) {
    const roles = await this.usersService.getRoles(restaurantId);
    return { success: true, roles };
  }

  @ApiOperation({ summary: 'Get restaurant users' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Get(':id/users')
  @ApiBearerAuth()
  async getRestaurantUsers(@VerifyRestaurantAccess('id') restaurantId: string) {
    const users = await this.usersService.getRestaurantUsers(restaurantId);
    return { success: true, users };
  }

  @ApiOperation({ summary: 'Invite user to restaurant' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @Post(':id/users')
  @ApiBearerAuth()
  async inviteUser(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: InviteUserDto,
  ) {
    console.log('Received invite user DTO:', dto);

    // Support both roleId (new) and role name (legacy)
    const newUser = await this.usersService.inviteUser(restaurantId, {
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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    const updatedUser = await this.usersService.updateUserRole(
      restaurantId,
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
    @VerifyRestaurantRole({ paramName: 'id', role: 'OWNER' })
    restaurantId: string,
    @Param('userId') userId: string,
  ) {
    return this.usersService.removeUser(restaurantId, userId);
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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() body: { type?: string },
    @Query('type') queryType?: string,
  ) {
    const type = body?.type ?? queryType;

    if (!type) {
      throw new BadRequestException('Asset type is required');
    }

    const result = await this.brandingService.deleteAsset(restaurantId, type);
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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Query('type') type: string,
    @Query('contentType') contentType?: string,
    @Query('filename') filename?: string,
  ) {
    if (!type) {
      throw new BadRequestException('Asset type is required');
    }

    const result = await this.brandingService.presignAssetUpload(
      restaurantId,
      type,
      {
        contentType,
        filename,
      },
    );

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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: string },
    @Query('type') queryType?: string,
  ) {
    const type = body?.type ?? queryType;
    if (!type) {
      throw new BadRequestException('Asset type is required');
    }

    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.brandingService.saveUploadedAsset(
      restaurantId,
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
    @VerifyRestaurantAccess('id') restaurantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.brandingService.saveUploadedAsset(
      restaurantId,
      file,
      'logo',
    );

    return { success: true, result };
  }

  @ApiOperation({ summary: 'Delete restaurant (soft)' })
  @Delete(':id')
  @ApiBearerAuth()
  async deleteRestaurant(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Only owner or admin allowed
    const allowedRoles = ['OWNER', 'Owner', 'owner', 'Admin', 'admin'];
    if (!user.role || !allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        'Only the owner or admin can delete the restaurant',
      );
    }

    const result = await this.restaurantsService.deleteRestaurant(
      restaurantId,
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
