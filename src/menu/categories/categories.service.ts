import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import * as path from 'path';
import { S3Service } from '../../storage/s3.service';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async findAll(restaurantId: string, userId: string) {
    // Verificar ownership
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const categories = await this.prisma.category.findMany({
      where: {
        restaurantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        isActive: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            dishes: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    return {
      categories: categories.map((cat) => ({
        ...cat,
        image: this.s3.toClientUrl(cat.image),
        dishCount: cat._count.dishes,
        _count: undefined,
      })),
    };
  }

  async create(restaurantId: string, userId: string, dto: CreateCategoryDto) {
    // Verificar ownership
    await this.verifyRestaurantOwnership(restaurantId, userId);

    // Verificar nombre único
    const existing = await this.prisma.category.findFirst({
      where: {
        restaurantId,
        name: dto.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Category with name "${dto.name}" already exists`,
      );
    }

    // Si no se provee order, obtener el siguiente disponible
    let order = dto.order;
    if (order === undefined) {
      const maxOrder = await this.prisma.category.findFirst({
        where: { restaurantId, deletedAt: null },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      order = (maxOrder?.order ?? -1) + 1;
    }

    let imagePath: string | null | undefined;
    if (dto.image) {
      imagePath = await this.saveBase64Image(dto.image, 'category');
    }

    const category = await this.prisma.category.create({
      data: {
        restaurantId,
        name: dto.name,
        description: dto.description,
        image: imagePath,
        order,
        isActive: dto.isActive ?? true,
      },
    });

    return {
      category: {
        ...category,
        image: this.s3.toClientUrl(category.image),
      },
    };
  }

  async update(categoryId: string, userId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { restaurant: true },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException('Category not found');
    }

    // Verificar ownership
    await this.verifyRestaurantOwnership(category.restaurantId, userId);

    // Si se cambia el nombre, verificar unicidad
    if (dto.name && dto.name !== category.name) {
      const existing = await this.prisma.category.findFirst({
        where: {
          restaurantId: category.restaurantId,
          name: dto.name,
          deletedAt: null,
          id: { not: categoryId },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Category with name "${dto.name}" already exists`,
        );
      }
    }

    let imagePath: string | null | undefined;
    if (dto.image) {
      // Eliminar imagen anterior si existe
      if (category.image) {
        await this.s3.deleteObjectByUrl(category.image);
      }
      imagePath = await this.saveBase64Image(dto.image, 'category');
    }

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        description: dto.description,
        image: imagePath !== undefined ? imagePath : undefined,
        order: dto.order,
        isActive: dto.isActive,
      },
    });

    return {
      category: {
        ...updated,
        image: this.s3.toClientUrl(updated.image),
      },
    };
  }

  async delete(categoryId: string, userId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: {
            dishes: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException('Category not found');
    }

    // Verificar ownership
    await this.verifyRestaurantOwnership(category.restaurantId, userId);

    // Verificar si tiene platos
    if (category._count.dishes > 0) {
      throw new ConflictException(
        'Cannot delete category with active dishes. Please delete or move the dishes first.',
      );
    }

    // Eliminar imagen si existe
    if (category.image) {
      await this.s3.deleteObjectByUrl(category.image);
    }

    // Soft delete
    await this.prisma.category.update({
      where: { id: categoryId },
      data: { deletedAt: new Date() },
    });
  }

  async reorder(
    restaurantId: string,
    userId: string,
    categoryOrders: Array<{ id: string; order: number }>,
  ) {
    // Verificar ownership
    await this.verifyRestaurantOwnership(restaurantId, userId);

    // Actualizar en una transacción
    await this.prisma.$transaction(
      categoryOrders.map((item) =>
        this.prisma.category.update({
          where: { id: item.id, restaurantId },
          data: { order: item.order },
        }),
      ),
    );

    return {
      message: 'Categories reordered successfully',
      updated: categoryOrders.length,
    };
  }

  private async verifyRestaurantOwnership(
    restaurantId: string,
    userId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        users: {
          where: { id: userId },
        },
      },
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
        throw new BadRequestException(
          'Legacy external URLs are not supported. Please upload the image to /api/uploads and send the returned key.',
        );
      }

      // Si ya es una ruta local (/uploads/...), normalizar según backend (Spaces/CDN)
      if (base64String.startsWith('/uploads/')) {
        throw new BadRequestException(
          'Legacy local uploads are not supported. Please upload the image to /api/uploads and send the returned key.',
        );
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
