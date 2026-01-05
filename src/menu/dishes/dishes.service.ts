import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDishDto, UpdateDishDto } from './dto/dish.dto';
import * as path from 'path';
import { S3Service } from '../../storage/s3.service';

export interface DishFilters {
  categoryId?: string;
  available?: boolean;
  featured?: boolean;
  search?: string;
}

@Injectable()
export class DishesService {
  constructor(
    private prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async findAllPublic(restaurantId: string, filters?: DishFilters) {
    const where: any = {
      restaurantId,
      deletedAt: null,
      isAvailable: true, // Solo platos disponibles
    };

    if (filters?.categoryId) where.categoryId = filters.categoryId;

    const dishes = await this.prisma.dish.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ category: { order: 'asc' } }, { name: 'asc' }],
    });

    return {
      dishes: dishes.map((d) => ({
        ...d,
        image: this.s3.toClientUrl(d.image),
      })),
      total: dishes.length,
    };
  }

  async findAll(restaurantId: string, userId: string, filters?: DishFilters) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const where: any = {
      restaurantId,
      deletedAt: null,
    };

    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.available !== undefined) where.isAvailable = filters.available;
    if (filters?.featured !== undefined) where.isFeatured = filters.featured;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const dishes = await this.prisma.dish.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ category: { order: 'asc' } }, { name: 'asc' }],
    });

    return {
      dishes: dishes.map((d) => ({
        ...d,
        image: this.s3.toClientUrl(d.image),
      })),
      total: dishes.length,
    };
  }

  async create(restaurantId: string, userId: string, dto: CreateDishDto) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, restaurantId, deletedAt: null },
    });

    if (!category) {
      throw new BadRequestException(
        'Category not found or does not belong to this restaurant',
      );
    }

    let imagePath: string | null | undefined;
    if (dto.image) {
      imagePath = await this.saveBase64Image(dto.image, 'dish');
    }

    const dish = await this.prisma.dish.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        image: imagePath,
        preparationTime: dto.preparationTime,
        isFeatured: dto.isFeatured ?? false,
        tags: dto.tags ?? [],
        allergens: dto.allergens ?? [],
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return {
      dish: {
        ...dish,
        image: this.s3.toClientUrl(dish.image),
      },
    };
  }

  async update(dishId: string, userId: string, dto: UpdateDishDto) {
    try {
      const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

      if (!dish || dish.deletedAt) {
        throw new NotFoundException('Dish not found');
      }

      await this.verifyRestaurantOwnership(dish.restaurantId, userId);

      if (dto.categoryId && dto.categoryId !== dish.categoryId) {
        const category = await this.prisma.category.findFirst({
          where: {
            id: dto.categoryId,
            restaurantId: dish.restaurantId,
            deletedAt: null,
          },
        });

        if (!category) {
          throw new BadRequestException(
            'Category not found or does not belong to this restaurant',
          );
        }
      }

      let imagePath: string | null | undefined;
      if (dto.image !== undefined) {
        if (dto.image === null || dto.image === '') {
          // Eliminar imagen
          if (dish.image) {
            await this.s3.deleteObjectByUrl(dish.image);
          }
          imagePath = null;
        } else if (dto.image) {
          // Actualizar imagen
          // Si viene base64 (data:image/...), subimos a S3 y borramos la anterior
          const isBase64 = /^data:image\//i.test(dto.image);
          if (dish.image && isBase64)
            await this.s3.deleteObjectByUrl(dish.image);
          imagePath = await this.saveBase64Image(dto.image, 'dish');
        }
      }

      const updated = await this.prisma.dish.update({
        where: { id: dishId },
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          categoryId: dto.categoryId,
          image: imagePath !== undefined ? imagePath : undefined,
          preparationTime: dto.preparationTime,
          isAvailable: dto.isAvailable,
          isFeatured: dto.isFeatured,
          tags: dto.tags,
          allergens: dto.allergens,
        },
        include: { category: { select: { id: true, name: true } } },
      });

      return {
        dish: {
          ...updated,
          image: this.s3.toClientUrl(updated.image),
        },
      };
    } catch (error) {
      console.error('❌ Error updating dish:', {
        dishId,
        error: error.message,
        stack: error.stack,
        imageProvided: !!dto.image,
        imageType: typeof dto.image,
        imagePreview: dto.image?.substring(0, 100),
      });
      throw error;
    }
  }

  async delete(dishId: string, userId: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

    if (!dish || dish.deletedAt) {
      throw new NotFoundException('Dish not found');
    }

    await this.verifyRestaurantOwnership(dish.restaurantId, userId);

    // Eliminar imagen si existe
    if (dish.image) {
      await this.s3.deleteObjectByUrl(dish.image);
    }

    await this.prisma.dish.update({
      where: { id: dishId },
      data: { deletedAt: new Date() },
    });
  }

  async toggleAvailability(
    dishId: string,
    userId: string,
    isAvailable: boolean,
  ) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

    if (!dish || dish.deletedAt) {
      throw new NotFoundException('Dish not found');
    }

    await this.verifyRestaurantOwnership(dish.restaurantId, userId);

    const updated = await this.prisma.dish.update({
      where: { id: dishId },
      data: { isAvailable },
      select: { id: true, name: true, isAvailable: true },
    });

    return { dish: updated };
  }

  private async verifyRestaurantOwnership(
    restaurantId: string,
    userId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { users: { where: { id: userId } } },
    });

    if (!restaurant || restaurant.users.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to manage this restaurant',
      );
    }
  }

  private async saveBase64Image(
    base64String: string,
    type: 'dish' | 'category',
  ): Promise<string | null> {
    try {
      // Si ya es una URL/endpoint proxy, extraer key (para guardar key en DB)
      if (base64String.startsWith('/api/uploads/')) {
        return (
          base64String.replace(/^\/api\/uploads\//, '').split('?')[0] || null
        );
      }

      // Si ya es una URL absoluta (legacy), retornarla tal cual
      if (/^https?:\/\//i.test(base64String)) {
        return base64String;
      }

      // Si es null o vacío, retornar null
      if (
        !base64String ||
        base64String === 'null' ||
        base64String === 'undefined'
      ) {
        return null;
      }

      // Validar formato base64
      const matches = base64String.match(/^data:image\/([\w+]+);base64,(.+)$/);
      if (!matches) {
        console.error('❌ Invalid base64 format:', {
          type,
          stringLength: base64String?.length,
          preview: base64String?.substring(0, 100),
        });
        throw new BadRequestException(
          'Invalid base64 image format. Expected format: data:image/[type];base64,[data]',
        );
      }

      const extension = matches[1].toLowerCase();
      const data = matches[2];

      // Validar extensión
      const validExtensions = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
      if (!validExtensions.includes(extension)) {
        throw new BadRequestException(
          `Invalid image type: ${extension}. Allowed: ${validExtensions.join(', ')}`,
        );
      }

      const buffer = Buffer.from(data, 'base64');

      // Validar tamaño (máx 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (buffer.length > maxSize) {
        throw new BadRequestException(
          `Image too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Maximum: 10MB`,
        );
      }

      const folderName = type === 'dish' ? 'dishes' : 'categories';
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
      const key = path.posix.join(folderName, filename);

      const uploaded = await this.s3.uploadObject({
        key,
        body: buffer,
        contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        cacheControl: 'public, max-age=31536000, immutable',
      });

      // Guardamos el key en DB (bucket privado) y servimos vía /api/uploads/:key
      return uploaded.key;
    } catch (error) {
      throw new BadRequestException('Error saving image: ' + error.message);
    }
  }
}
