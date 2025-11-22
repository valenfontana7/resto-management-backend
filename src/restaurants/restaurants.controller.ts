import { Controller, Get, Post, Patch, Put, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';

@ApiTags('Restaurants')
@Controller('api/restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @ApiOperation({ summary: 'Get restaurant by slug' })
  @ApiParam({ name: 'slug', description: 'The slug of the restaurant' })
  @ApiResponse({ status: 200, description: 'Return the restaurant.' })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    const restaurant = await this.restaurantsService.findBySlug(slug);
    return { data: restaurant };
  }

  @ApiOperation({ summary: 'Create a new restaurant' })
  @ApiBody({
    schema: { example: { name: 'My Restaurant', address: '123 Main St' } },
  })
  @ApiResponse({
    status: 201,
    description: 'The restaurant has been successfully created.',
  })
  @Post()
  async create(@Body() createDto: any) {
    const restaurant = await this.restaurantsService.create(createDto);
    return { data: restaurant };
  }

  @ApiOperation({ summary: 'Update restaurant configuration' })
  @ApiParam({ name: 'id', description: 'The id of the restaurant' })
  @ApiResponse({
    status: 200,
    description: 'The restaurant has been successfully updated.',
  })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: any) {
    const restaurant = await this.restaurantsService.update(id, updateDto);
    return { data: restaurant };
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
