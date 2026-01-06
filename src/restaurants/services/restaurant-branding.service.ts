import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../storage/s3.service';
import { UpdateBrandingDto } from '../dto/restaurant-settings.dto';

/**
 * Servicio para gestión de branding y assets de restaurante.
 * Extraído de RestaurantsService para cumplir con SRP (SOLID).
 */
@Injectable()
export class RestaurantBrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Actualizar branding del restaurante
   * @deprecated Use update() en RestaurantsService con campo branding JSON
   */
  async updateBranding(id: string, branding: UpdateBrandingDto) {
    const brandingData: any = {};

    if (branding.colors || branding.layout || branding.logo !== undefined) {
      brandingData.branding = {};

      if (branding.colors) {
        brandingData.branding.colors = branding.colors;
      }

      if (branding.layout) {
        brandingData.branding.layout = branding.layout;
      }

      if (branding.logo !== undefined) {
        brandingData.branding.logo = branding.logo;
      }

      if (branding.coverImage !== undefined) {
        brandingData.branding.bannerImage = branding.coverImage;
      }
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: brandingData,
    });
  }

  /**
   * Eliminar un asset del restaurante por tipo
   */
  async deleteAsset(id: string, type?: string) {
    const restaurant: any = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${id} not found`);
    }

    if (!type) {
      throw new BadRequestException('Asset type is required');
    }

    const updateData: any = {};
    const normalized = String(type).toLowerCase();

    if (
      normalized === 'banner' ||
      normalized === 'cover' ||
      normalized === 'coverimage'
    ) {
      await this.s3.deleteObjectByUrl(restaurant.coverImage);
      updateData.coverImage = null;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.bannerImage !== undefined) {
          await this.s3.deleteObjectByUrl(branding.bannerImage);
          branding.bannerImage = null;
        }
        if (branding.coverImage !== undefined) {
          await this.s3.deleteObjectByUrl(branding.coverImage);
          branding.coverImage = null;
        }
        updateData.branding = branding;
      }
    } else if (normalized === 'logo') {
      await this.s3.deleteObjectByUrl(restaurant.logo);
      updateData.logo = null;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.logo !== undefined) {
          await this.s3.deleteObjectByUrl(branding.logo);
          branding.logo = null;
        }
        updateData.branding = branding;
      }
    } else if (normalized === 'favicon') {
      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.favicon !== undefined) {
          await this.s3.deleteObjectByUrl(branding.favicon);
          branding.favicon = null;
        }
        updateData.branding = branding;
      }
    } else {
      throw new BadRequestException(`Unknown asset type: ${type}`);
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: updateData,
    });

    return { restaurant: this.mapRestaurantForClient(updated) };
  }

  /**
   * Generar URL pre-firmada para subida de asset
   */
  async presignAssetUpload(
    id: string,
    type: string,
    opts?: { contentType?: string; filename?: string },
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${id} not found`);
    }

    const normalized = String(type).toLowerCase();
    const assetType =
      normalized === 'logo'
        ? 'logo'
        : normalized === 'banner' ||
            normalized === 'cover' ||
            normalized === 'coverimage'
          ? 'banner'
          : normalized === 'favicon'
            ? 'favicon'
            : null;

    if (!assetType) {
      throw new BadRequestException(`Unknown asset type: ${type}`);
    }

    let ext = (opts?.filename ? path.extname(opts.filename) : '').toLowerCase();
    if (!ext && opts?.contentType) {
      ext = this.getExtensionFromMime(opts.contentType);
    }
    if (!ext) ext = '.jpg';

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = path.posix.join(
      'restaurants',
      id,
      assetType,
      `${unique}${ext}`,
    );

    return this.s3.createPresignedPutUrl({
      key,
      contentType: opts?.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      expiresInSeconds: 60,
    });
  }

  /**
   * Guardar archivo de asset subido a S3 y actualizar registro
   */
  async saveUploadedAsset(id: string, file: Express.Multer.File, type: string) {
    const restaurant: any = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${id} not found`);
    }

    const normalized = String(type).toLowerCase();

    if (!file?.buffer || !file?.mimetype) {
      throw new BadRequestException('Invalid upload: missing file buffer');
    }

    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = path.posix.join(
      'restaurants',
      id,
      normalized,
      `${unique}${ext}`,
    );

    const uploaded = await this.s3.uploadObject({
      key,
      body: file.buffer,
      contentType: file.mimetype,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const updateData: any = {};

    if (
      normalized === 'banner' ||
      normalized === 'cover' ||
      normalized === 'coverimage'
    ) {
      await this.s3.deleteObjectByUrl(restaurant.coverImage);
      updateData.coverImage = uploaded.key;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.bannerImage !== undefined) {
          await this.s3.deleteObjectByUrl(branding.bannerImage);
        }
        if (branding.coverImage !== undefined) {
          await this.s3.deleteObjectByUrl(branding.coverImage);
        }
        branding.bannerImage = uploaded.key;
        branding.coverImage = uploaded.key;
        updateData.branding = branding;
      }
    } else if (normalized === 'logo') {
      await this.s3.deleteObjectByUrl(restaurant.logo);
      updateData.logo = uploaded.key;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.logo !== undefined) {
          await this.s3.deleteObjectByUrl(branding.logo);
        }
        branding.logo = uploaded.key;
        updateData.branding = branding;
      }
    } else if (normalized === 'favicon') {
      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.favicon !== undefined) {
          await this.s3.deleteObjectByUrl(branding.favicon);
        }
        branding.favicon = uploaded.key;
        updateData.branding = branding;
      } else {
        updateData.branding = { favicon: uploaded.key };
      }
    } else {
      throw new BadRequestException(`Unknown asset type: ${type}`);
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: updateData,
    });

    return { restaurant: this.mapRestaurantForClient(updated) };
  }

  /**
   * Guardar imagen base64 (data URL) a S3
   */
  async saveDataUrl(
    restaurantId: string,
    dataUrl: string,
    prefix = 'asset',
  ): Promise<string> {
    const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      throw new BadRequestException('Invalid data URL for image');
    }

    const mime = match[1];
    const b64 = match[2];
    let ext = mime.split('/')[1] || 'png';
    if (ext === 'jpeg') ext = 'jpg';

    const filename = `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const buffer = Buffer.from(b64, 'base64');
    const key = path.posix.join('restaurants', restaurantId, filename);

    const uploaded = await this.s3.uploadObject({
      key,
      body: buffer,
      contentType: mime,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    return uploaded.key;
  }

  /**
   * Eliminar archivo si existe
   */
  deleteFileIfExists(p?: string | null) {
    try {
      if (!p) return;

      const asString = String(p);
      const key = asString.startsWith('/api/uploads/')
        ? asString.replace(/^\/api\/uploads\//, '').split('?')[0]
        : asString;

      // No borrar rutas locales legacy
      if (key.startsWith('/uploads/')) return;

      void this.s3.deleteObjectByUrl(key);
    } catch {
      // ignore
    }
  }

  // ─── Métodos privados ───────────────────────────────────────────────

  private getExtensionFromMime(contentType: string): string {
    const ct = contentType.toLowerCase();
    if (ct === 'image/jpeg' || ct === 'image/jpg') return '.jpg';
    if (ct === 'image/png') return '.png';
    if (ct === 'image/webp') return '.webp';
    if (ct === 'image/gif') return '.gif';
    if (ct === 'image/svg+xml') return '.svg';
    return '.jpg';
  }

  private mapRestaurantForClient<T extends Record<string, any> | null>(
    restaurant: T,
  ): T {
    if (!restaurant) return restaurant;

    const mapped: any = { ...restaurant };

    if ('logo' in mapped) mapped.logo = this.s3.toClientUrl(mapped.logo);
    if ('coverImage' in mapped) {
      mapped.coverImage = this.s3.toClientUrl(mapped.coverImage);
    }

    if (mapped.branding && typeof mapped.branding === 'object') {
      const branding: any = { ...mapped.branding };
      if (branding.logo) branding.logo = this.s3.toClientUrl(branding.logo);
      if (branding.bannerImage) {
        branding.bannerImage = this.s3.toClientUrl(branding.bannerImage);
      }
      if (branding.coverImage) {
        branding.coverImage = this.s3.toClientUrl(branding.coverImage);
      }
      if (branding.favicon) {
        branding.favicon = this.s3.toClientUrl(branding.favicon);
      }
      mapped.branding = branding;
    }

    return mapped;
  }
}
