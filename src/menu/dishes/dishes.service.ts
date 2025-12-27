import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../../uploads/uploads.service';
import { CreateDishDto, UpdateDishDto } from './dto/dish.dto';
import * as fs from 'fs';
import * as path from 'path';

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
    private uploadsService: UploadsService,
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

    const normalized = dishes.map((d) => ({
      ...d,
      image: d.image ? this.uploadsService.resolvePublicUrl(d.image) : d.image,
    }));

    return { dishes: normalized, total: normalized.length };
  }

  async findAll(restaurantId: string, userId: string, filters?: DishFilters) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const where: any = {
      restaurantId,
      deletedAt: null,
    };

    // Limpiar imágenes rotas (solo cuando se usa FS local)
    if (!this.uploadsService.isS3Enabled()) {
      await this.cleanBrokenImages(restaurantId);
    }

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

    const normalized = dishes.map((d) => ({
      ...d,
      image: d.image ? this.uploadsService.resolvePublicUrl(d.image) : d.image,
    }));

    return { dishes: normalized, total: normalized.length };
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

    return { dish };
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
            this.deleteImage(dish.image);
          }
          imagePath = null;
        } else if (dto.image) {
          // Actualizar imagen
          if (dish.image && !dto.image.startsWith('/uploads/')) {
            this.deleteImage(dish.image);
          }
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

      return { dish: updated };
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
      this.deleteImage(dish.image);
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
      // Si ya es una URL http(s), retornarla directamente
      if (/^https?:\/\//i.test(base64String)) {
        return base64String;
      }

      // Si ya es una ruta local (/uploads/...), normalizar según backend (Spaces/CDN)
      if (base64String.startsWith('/uploads/')) {
        return this.uploadsService.resolvePublicUrl(base64String);
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

      // Crear directorio si no existe
      const folderName = type === 'dish' ? 'dishes' : 'categories';
      // Generar nombre único para el archivo
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

      const relativePath = `/uploads/${folderName}/${filename}`;

      // Si está habilitado Spaces/S3, subimos y devolvemos URL pública
      if (this.uploadsService.isS3Enabled()) {
        const key = relativePath.replace(/^\//, '');
        return await this.uploadsService.putPublicObject({
          key,
          body: buffer,
          contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        });
      }

      const uploadDir = path.join(process.cwd(), 'uploads', folderName);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, buffer);
      return relativePath;
    } catch (error) {
      throw new BadRequestException('Error saving image: ' + error.message);
    }
  }

  private deleteImage(imagePath: string): void {
    try {
      if (/^https?:\/\//i.test(imagePath)) return;
      if (this.uploadsService.isS3Enabled()) return;
      const fullPath = path.join(process.cwd(), imagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }

  /**
   * Limpia imágenes rotas de la base de datos
   * Si la imagen no existe en disco, la elimina de la BD
   */
  private async cleanBrokenImages(restaurantId: string): Promise<void> {
    try {
      const dishes = await this.prisma.dish.findMany({
        where: { restaurantId, image: { not: null }, deletedAt: null },
        select: { id: true, image: true },
      });

      for (const dish of dishes) {
        if (!dish.image) continue;

        const fullPath = path.join(process.cwd(), dish.image);
        if (!fs.existsSync(fullPath)) {
          console.log(
            `🧹 Cleaning broken image for dish ${dish.id}: ${dish.image}`,
          );
          await this.prisma.dish.update({
            where: { id: dish.id },
            data: { image: null },
          });
        }
      }
    } catch (error) {
      console.error('Error cleaning broken images:', error);
    }
  }
}
