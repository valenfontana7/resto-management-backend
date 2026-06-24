import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RestaurantsService } from './restaurants.service';

@ApiTags('public-restaurants')
@Controller()
export class RestaurantsPublicController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get('api/public/restaurants')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000) // 5 min
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Listar restaurantes públicos para sitemap' })
  @ApiResponse({ status: 200, description: 'Lista de restaurantes' })
  async getPublicRestaurants() {
    // Retornar restaurantes activos con campos básicos para sitemap
    return this.restaurantsService.getPublicRestaurants();
  }

  @Get('api/public/restaurants/slug-available')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Chequear disponibilidad de slug para onboarding' })
  @ApiQuery({ name: 'slug', required: true, description: 'Slug a validar' })
  @ApiResponse({
    status: 200,
    description: 'Disponibilidad + sugerencias alternativas',
  })
  async checkSlugAvailable(@Query('slug') slug: string) {
    return this.restaurantsService.checkSlugAvailability(slug);
  }
}
