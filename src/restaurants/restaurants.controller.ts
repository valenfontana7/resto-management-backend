import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
  @ApiResponse({
    status: 200,
    description: 'The restaurant has been successfully updated.',
  })
  async update(
    @Param('id') id: string,
    @Body() updateDto: any,
    @CurrentUser() user: RequestUser,
  ) {
    // Verify ownership
    if (user.restaurantId !== id) {
      throw new ForbiddenException('You can only update your own restaurant');
    }

    const restaurant = await this.restaurantsService.update(id, updateDto);
    return { restaurant };
  }

  @ApiOperation({ summary: 'Update restaurant hours' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @ApiResponse({
    status: 200,
    description: 'The restaurant hours have been successfully updated.',
  })
  @Put(':id/hours')
  async updateHours(@Param('id') id: string, @Body() hours: any[]) {
    const updatedHours = await this.restaurantsService.updateHours(id, hours);
    return { data: updatedHours };
  }
}
