import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../storage/s3.service';
import { UpdateBrandingV2Dto } from '../dto/branding-v2.dto';

/**
 * Servicio V2 para gestión de branding de restaurante.
 * Implementa estructura mejorada con tema global y configuraciones por sección.
 */
@Injectable()
export class RestaurantBrandingV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Actualizar branding del restaurante con estructura V2
   * Soporta actualizaciones parciales (merge profundo)
   */
  async updateBranding(restaurantId: string, dto: UpdateBrandingV2Dto) {
    // Verificar que el restaurante existe
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, branding: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    // Obtener branding actual (si existe)
    const currentBranding = (restaurant.branding as any) || {};

    // Merge profundo: combinar branding actual con nuevos datos
    const updatedBranding = this.mergeBranding(currentBranding, dto);

    // Actualizar en la base de datos
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: updatedBranding,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        branding: true,
      },
    });

    return {
      success: true,
      branding: updated.branding,
    };
  }

  /**
   * Obtener branding actual del restaurante
   */
  async getBranding(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { branding: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    return restaurant.branding || this.getDefaultBranding();
  }

  /**
   * Actualizar solo una sección específica del branding
   */
  async updateSection(
    restaurantId: string,
    sectionName: string,
    sectionData: any,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { branding: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    const currentBranding = (restaurant.branding as any) || {};

    // Actualizar solo la sección específica
    const updatedBranding = {
      ...currentBranding,
      sections: {
        ...(currentBranding.sections || {}),
        [sectionName]: {
          ...((currentBranding.sections &&
            currentBranding.sections[sectionName]) ||
            {}),
          ...sectionData,
        },
      },
    };

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: updatedBranding,
        updatedAt: new Date(),
      },
      select: { branding: true },
    });

    return {
      success: true,
      section: sectionName,
      data: (updated.branding as any)?.sections?.[sectionName],
    };
  }

  /**
   * Actualizar solo el tema
   */
  async updateTheme(restaurantId: string, themeData: any) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { branding: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    const currentBranding = (restaurant.branding as any) || {};

    const updatedBranding = {
      ...currentBranding,
      theme: {
        ...(currentBranding.theme || {}),
        ...themeData,
      },
    };

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: updatedBranding,
        updatedAt: new Date(),
      },
      select: { branding: true },
    });

    return {
      success: true,
      theme: (updated.branding as any)?.theme,
    };
  }

  /**
   * Resetear branding a valores por defecto
   */
  async resetBranding(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    const defaultBranding = this.getDefaultBranding();

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: defaultBranding,
        updatedAt: new Date(),
      },
      select: { branding: true },
    });

    return {
      success: true,
      branding: updated.branding,
      message: 'Branding reset to default values',
    };
  }

  /**
   * Merge profundo de objetos branding
   */
  private mergeBranding(current: any, updates: any): any {
    const result = { ...current };

    for (const key in updates) {
      if (updates[key] === undefined) continue;

      if (
        updates[key] !== null &&
        typeof updates[key] === 'object' &&
        !Array.isArray(updates[key])
      ) {
        // Merge recursivo para objetos
        result[key] = this.mergeBranding(result[key] || {}, updates[key]);
      } else {
        // Reemplazo directo para valores primitivos y arrays
        result[key] = updates[key];
      }
    }

    return result;
  }

  /**
   * Obtener branding por defecto
   */
  private getDefaultBranding() {
    return {
      theme: {
        colors: {
          primary: '#3b82f6',
          secondary: '#8b5cf6',
          accent: '#ec4899',
          background: '#ffffff',
          text: '#1f2937',
          muted: '#6b7280',
        },
        typography: {
          fontFamily: 'Inter, sans-serif',
          headingFontFamily: 'Inter, sans-serif',
        },
        spacing: {
          borderRadius: 'md',
          cardShadow: true,
        },
      },
      layout: {
        maxWidth: 'xl',
        showHeroSection: true,
        showFeaturedDishes: true,
        showTestimonials: false,
      },
      sections: {
        nav: {
          logoSize: 'md',
          showOpenStatus: true,
          showContactButton: true,
          sticky: false,
        },
        hero: {
          minHeight: 'lg',
          textAlign: 'center',
          textShadow: false,
          overlay: {
            enabled: false,
            opacity: 0,
          },
        },
        menu: {
          layout: 'grid',
          columns: 3,
          showImages: true,
          showPrices: true,
          cardStyle: {
            hoverEffect: true,
          },
        },
        cart: {
          position: 'fixed',
          location: 'right',
        },
        footer: {
          showSocialLinks: true,
          showBusinessInfo: true,
          showOpeningHours: true,
          layout: 'simple',
        },
        checkout: {
          layout: 'single-page',
          buttonStyle: 'solid',
          showOrderSummary: true,
        },
        reservations: {
          formStyle: 'card',
          showAvailability: true,
          requireDeposit: false,
        },
      },
      mobileMenu: {
        style: {
          position: 'bottom',
        },
        items: [
          {
            label: 'Inicio',
            href: '/',
            icon: 'home',
            enabled: true,
          },
          {
            label: 'Menú',
            href: '/menu',
            icon: 'menu',
            enabled: true,
          },
        ],
      },
    };
  }

  /**
   * Migrar branding V1 a V2
   * Convierte la estructura antigua a la nueva
   */
  async migrateFromV1(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { branding: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    const v1Branding = restaurant.branding as any;
    if (!v1Branding) {
      return { success: false, message: 'No branding to migrate' };
    }

    // Mapear V1 a V2
    const v2Branding: any = {
      assets: {},
      theme: {
        colors: {},
        spacing: {},
      },
      sections: {},
    };

    // Migrar assets
    if (v1Branding.logo) v2Branding.assets.logo = v1Branding.logo;
    if (v1Branding.favicon) v2Branding.assets.favicon = v1Branding.favicon;
    if (v1Branding.coverImage)
      v2Branding.assets.coverImage = v1Branding.coverImage;
    if (v1Branding.bannerImage)
      v2Branding.assets.coverImage = v1Branding.bannerImage;

    // Migrar colores globales
    if (v1Branding.colors) {
      v2Branding.theme.colors = { ...v1Branding.colors };
    }

    // Migrar layout
    if (v1Branding.layout) {
      v2Branding.layout = { ...v1Branding.layout };
    }

    // Migrar secciones (mantener lo que ya existe)
    if (v1Branding.sections) {
      v2Branding.sections = { ...v1Branding.sections };
    } else {
      // Migrar secciones individuales
      if (v1Branding.nav) v2Branding.sections.nav = v1Branding.nav;
      if (v1Branding.hero) v2Branding.sections.hero = v1Branding.hero;
      if (v1Branding.menu) v2Branding.sections.menu = v1Branding.menu;
      if (v1Branding.cart) v2Branding.sections.cart = v1Branding.cart;
      if (v1Branding.footer) v2Branding.sections.footer = v1Branding.footer;
      if (v1Branding.checkout)
        v2Branding.sections.checkout = v1Branding.checkout;
      if (v1Branding.reservations)
        v2Branding.sections.reservations = v1Branding.reservations;
    }

    // Migrar mobile menu
    if (v1Branding.mobileMenu) {
      v2Branding.mobileMenu = { ...v1Branding.mobileMenu };
    }

    // Actualizar en BD
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: v2Branding,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Branding migrated from V1 to V2',
      branding: v2Branding,
    };
  }

  // ==================== Asset Management ====================

  /**
   * Eliminar asset del restaurante
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
        if (branding.assets?.coverImage) {
          await this.s3.deleteObjectByUrl(branding.assets.coverImage);
          branding.assets.coverImage = null;
        }
        updateData.branding = branding;
      }
    } else if (normalized === 'logo') {
      await this.s3.deleteObjectByUrl(restaurant.logo);
      updateData.logo = null;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.assets?.logo) {
          await this.s3.deleteObjectByUrl(branding.assets.logo);
          branding.assets.logo = null;
        }
        updateData.branding = branding;
      }
    } else if (normalized === 'favicon') {
      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.assets?.favicon) {
          await this.s3.deleteObjectByUrl(branding.assets.favicon);
          branding.assets.favicon = null;
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
        if (!branding.assets) branding.assets = {};
        if (branding.assets.coverImage) {
          await this.s3.deleteObjectByUrl(branding.assets.coverImage);
        }
        branding.assets.coverImage = uploaded.key;
        updateData.branding = branding;
      }
    } else if (normalized === 'logo') {
      await this.s3.deleteObjectByUrl(restaurant.logo);
      updateData.logo = uploaded.key;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (!branding.assets) branding.assets = {};
        if (branding.assets.logo) {
          await this.s3.deleteObjectByUrl(branding.assets.logo);
        }
        branding.assets.logo = uploaded.key;
        updateData.branding = branding;
      }
    } else if (normalized === 'favicon') {
      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (!branding.assets) branding.assets = {};
        if (branding.assets.favicon) {
          await this.s3.deleteObjectByUrl(branding.assets.favicon);
        }
        branding.assets.favicon = uploaded.key;
        updateData.branding = branding;
      } else {
        updateData.branding = { assets: { favicon: uploaded.key } };
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

  // ==================== Private Utilities ====================

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
      if (branding.assets) {
        if (branding.assets.logo) {
          branding.assets.logo = this.s3.toClientUrl(branding.assets.logo);
        }
        if (branding.assets.coverImage) {
          branding.assets.coverImage = this.s3.toClientUrl(
            branding.assets.coverImage,
          );
        }
        if (branding.assets.favicon) {
          branding.assets.favicon = this.s3.toClientUrl(
            branding.assets.favicon,
          );
        }
      }
      mapped.branding = branding;
    }

    return mapped;
  }
}
