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
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { S3Service } from '../../storage/s3.service';
import { Public } from '../../auth/decorators/public.decorator';
import { PublicWriteAbuseService } from '../../common/services/public-write-abuse.service';
import { getClientIp } from '../../common/utils/client-ip.util';
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
    private s3: S3Service,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Public()
  @Get('api/public/:slug/menu')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(120_000) // 2 min — menu updates are semi-frequent
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Get menu by restaurant slug (public)' })
  @ApiParam({ name: 'slug', description: 'The slug of the restaurant' })
  @ApiResponse({
    status: 200,
    description: 'Return the menu categories with dishes.',
  })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  async getMenu(@Param('slug') slug: string, @Req() req: Request) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'public_read',
      restaurantId: restaurant.id,
    });

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
          include: {
            modifierGroups: {
              orderBy: { order: 'asc' },
              include: {
                modifiers: {
                  where: { isAvailable: true },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    // Convert dish images to client URLs (handles external URLs)
    for (const category of categories) {
      for (const dish of category.dishes) {
        if (dish.image) {
          dish.image = this.s3.toClientUrl(dish.image) as string;
        }
      }
    }

    return { menu: categories };
  }

  @Public()
  @Get('api/restaurants/:restaurantId/menu')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Get menu by restaurant ID (public)' })
  @ApiParam({ name: 'restaurantId', description: 'The ID of the restaurant' })
  @ApiResponse({
    status: 200,
    description: 'Return the menu categories with dishes.',
  })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  async getMenuById(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Request,
    @CurrentUser() user?: RequestUser,
  ) {
    await this.assertAnonymousPublicRead(req, user, restaurantId);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const categories = await this.prisma.category.findMany({
      where: {
        restaurantId: restaurantId,
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
          include: {
            modifierGroups: {
              orderBy: { order: 'asc' },
              include: {
                modifiers: {
                  where: { isAvailable: true },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    // Convert dish images to client URLs (handles external URLs)
    for (const category of categories) {
      for (const dish of category.dishes) {
        if (dish.image) {
          dish.image = this.s3.toClientUrl(dish.image) as string;
        }
      }
    }

    return { categories };
  }

  // ========== ENDPOINTS ADMIN ==========

  @Public()
  @Get('api/restaurants/:restaurantId/categories/public')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Get all categories (public)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiResponse({ status: 200, description: 'Categories retrieved' })
  async getCategoriesPublic(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Request,
    @CurrentUser() user?: RequestUser,
  ) {
    await this.assertAnonymousPublicRead(req, user, restaurantId);

    const categories = await this.prisma.category.findMany({
      where: {
        restaurantId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        order: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { order: 'asc' },
    });

    return { categories };
  }

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

  @Patch('api/restaurants/:restaurantId/categories/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update category (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.update(id, user.userId, dto);
  }

  @Delete('api/restaurants/:restaurantId/categories/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204, description: 'Category deleted' })
  async deleteCategory(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.categoriesService.delete(id, user.userId);
  }

  @Patch('api/restaurants/:restaurantId/categories/reorder')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder categories (admin)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiResponse({ status: 200, description: 'Categories reordered' })
  async reorderCategories(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ReorderCategoriesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.reorder(
      restaurantId,
      user.userId,
      dto.categoryOrders,
    );
  }

  /** Rate limit solo para clientes anónimos (web pública). Staff autenticado queda exento. */
  private async assertAnonymousPublicRead(
    req: Request,
    user: RequestUser | undefined,
    restaurantId: string,
  ): Promise<void> {
    if (user?.userId) {
      return;
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'public_read',
      restaurantId,
    });
  }
}
