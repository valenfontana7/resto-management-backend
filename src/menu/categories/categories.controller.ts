import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@ApiTags('Menu')
@Controller('api/:slug/menu')
export class CategoriesController {
  @ApiOperation({ summary: 'Get menu by restaurant slug' })
  @ApiParam({ name: 'slug', description: 'The slug of the restaurant' })
  @ApiResponse({
    status: 200,
    description: 'Return the menu categories with dishes.',
  })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  @Get()
  async getMenu(@Param('slug') slug: string) {
    // Buscar restaurante
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
    });

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    // Obtener categorías con platos
    const categories = await prisma.category.findMany({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
      },
      include: {
        dishes: {
          where: { isAvailable: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    return { data: categories };
  }
}
