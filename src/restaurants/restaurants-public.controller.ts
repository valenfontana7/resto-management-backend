import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RestaurantsService } from './restaurants.service';

@ApiTags('public-restaurants')
@Controller()
export class RestaurantsPublicController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get('api/public/restaurants')
  @Public()
  @ApiOperation({ summary: 'Listar restaurantes públicos para sitemap' })
  @ApiResponse({ status: 200, description: 'Lista de restaurantes' })
  async getPublicRestaurants() {
    // Retornar restaurantes activos con campos básicos para sitemap
    return this.restaurantsService.getPublicRestaurants();
  }
}
