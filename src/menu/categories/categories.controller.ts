import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
} from './dto/category.dto';

@ApiTags('Menu')
@Controller()
export class CategoriesController {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
  ) {}

  // ========== ENDPOINT PÚBLICO ==========

  @Public()
  @Get('api/public/:slug/menu')
  @ApiOperation({ summary: 'Get menu by restaurant slug (public)' })
  @ApiParam({ name: 'slug', description: 'The slug of the restaurant' })
  @ApiResponse({
    status: 200,
    description: 'Return the menu categories with dishes.',
  })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  async getMenu(@Param('slug') slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const categories = await this.prisma.category.findMany({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
        deletedAt: null,
      },
      include: {
        dishes: {
          where: {
            isAvailable: true,
            deletedAt: null,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    return { menu: categories };
  }

  // ========== ENDPOINTS ADMIN ==========

  @Get('api/restaurants/:restaurantId/categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all categories (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiResponse({ status: 200, description: 'Categories retrieved' })
  async getCategories(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.findAll(restaurantId, user.userId);
  }

  @Post('api/restaurants/:restaurantId/categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new category (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async createCategory(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.create(restaurantId, user.userId, dto);
  }

  @Patch('api/categories/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update category (admin)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.update(id, user.userId, dto);
  }

  @Delete('api/categories/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category (admin)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204, description: 'Category deleted' })
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.categoriesService.delete(id, user.userId);
  }

  @Patch('api/categories/reorder')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder categories (admin)' })
  @ApiResponse({ status: 200, description: 'Categories reordered' })
  async reorderCategories(
    @Body() dto: ReorderCategoriesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.reorder(
      dto.restaurantId,
      user.userId,
      dto.categoryOrders,
    );
  }
}
