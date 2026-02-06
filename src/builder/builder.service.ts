import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BuilderConfiguration,
  DEFAULT_BUILDER_CONFIG,
  validateBuilderConfig,
  isValidSectionName,
  SectionName,
} from './types/builder-config.types';
import { UpdateBuilderConfigDto } from './dto/builder-config.dto';

@Injectable()
export class BuilderService {
  private readonly logger = new Logger(BuilderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get builder configuration for a restaurant
   */
  async getConfig(restaurantId: string): Promise<BuilderConfiguration> {
    // Verify restaurant exists
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    // Try to get existing config
    const builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    if (builderConfig) {
      return builderConfig.config as unknown as BuilderConfiguration;
    }

    // Return default config if none exists
    return {
      ...DEFAULT_BUILDER_CONFIG,
      lastModified: new Date().toISOString(),
    };
  }

  /**
   * Update builder configuration (partial update with deep merge)
   */
  async updateConfig(
    restaurantId: string,
    updates: UpdateBuilderConfigDto,
    userId?: string,
  ): Promise<BuilderConfiguration> {
    this.logger.log(`Updating config for restaurant ${restaurantId}`);
    this.logger.debug(`Updates: ${JSON.stringify(updates, null, 2)}`);

    // Verify restaurant exists
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    // Get existing config or create new one
    let builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    const currentConfig = builderConfig
      ? (builderConfig.config as unknown as BuilderConfiguration)
      : { ...DEFAULT_BUILDER_CONFIG };

    // Deep merge updates into current config
    const newConfig = this.deepMerge(currentConfig, updates);

    // Update lastModified
    newConfig.lastModified = new Date().toISOString();

    // Validate the new config
    const validation = validateBuilderConfig(newConfig);
    if (!validation.isValid) {
      const errorMessages = validation.errors
        .filter((e) => e.severity === 'error')
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid configuration: ${errorMessages}`);
    }

    // Log warnings
    const warnings = validation.errors.filter((e) => e.severity === 'warning');
    if (warnings.length > 0) {
      this.logger.warn(
        `Config warnings for restaurant ${restaurantId}: ${warnings.map((w) => w.message).join(', ')}`,
      );
    }

    // Upsert the config
    if (builderConfig) {
      this.logger.log(
        `Updating existing config for restaurant ${restaurantId}`,
      );
      builderConfig = await this.prisma.builderConfig.update({
        where: { restaurantId },
        data: {
          config: newConfig as any,
          version: newConfig.version || builderConfig.version,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Config updated successfully`);
    } else {
      this.logger.log(`Creating new config for restaurant ${restaurantId}`);
      builderConfig = await this.prisma.builderConfig.create({
        data: {
          restaurantId,
          config: newConfig as any,
          version: newConfig.version || '1.0.0',
          createdBy: userId,
        },
      });
      this.logger.log(`Config created successfully`);
    }

    return builderConfig.config as unknown as BuilderConfiguration;
  }

  /**
   * Replace entire builder configuration
   */
  async replaceConfig(
    restaurantId: string,
    config: BuilderConfiguration,
    userId?: string,
  ): Promise<BuilderConfiguration> {
    // Verify restaurant exists
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    // Update lastModified
    config.lastModified = new Date().toISOString();

    // Validate the config
    const validation = validateBuilderConfig(config);
    if (!validation.isValid) {
      const errorMessages = validation.errors
        .filter((e) => e.severity === 'error')
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid configuration: ${errorMessages}`);
    }

    // Upsert the config
    const builderConfig = await this.prisma.builderConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        config: config as any,
        version: config.version || '1.0.0',
        createdBy: userId,
      },
      update: {
        config: config as any,
        version: config.version,
        updatedAt: new Date(),
      },
    });

    return builderConfig.config as unknown as BuilderConfiguration;
  }

  /**
   * Update theme configuration only
   */
  async updateTheme(
    restaurantId: string,
    themeUpdates: any,
  ): Promise<BuilderConfiguration['theme']> {
    const config = await this.updateConfig(restaurantId, {
      theme: themeUpdates,
    });
    return config.theme;
  }

  /**
   * Update layout configuration only
   */
  async updateLayout(
    restaurantId: string,
    layoutUpdates: any,
  ): Promise<BuilderConfiguration['layout']> {
    const config = await this.updateConfig(restaurantId, {
      layout: layoutUpdates,
    });
    return config.layout;
  }

  /**
   * Update assets configuration only
   */
  async updateAssets(
    restaurantId: string,
    assetsUpdates: any,
  ): Promise<BuilderConfiguration['assets']> {
    const config = await this.updateConfig(restaurantId, {
      assets: assetsUpdates,
    });
    return config.assets;
  }

  /**
   * Update a specific section
   */
  async updateSection(
    restaurantId: string,
    sectionName: string,
    sectionData: any,
  ): Promise<any> {
    if (!isValidSectionName(sectionName)) {
      throw new BadRequestException(
        `Invalid section name: ${sectionName}. Valid sections are: nav, hero, menu, info, footer, cart`,
      );
    }

    const config = await this.updateConfig(restaurantId, {
      sections: {
        [sectionName]: sectionData,
      },
    });

    return config.sections[sectionName as SectionName];
  }

  /**
   * Update mobile menu configuration
   */
  async updateMobileMenu(
    restaurantId: string,
    mobileMenuUpdates: any,
  ): Promise<BuilderConfiguration['mobileMenu']> {
    const config = await this.updateConfig(restaurantId, {
      mobileMenu: mobileMenuUpdates,
    });
    return config.mobileMenu;
  }

  /**
   * Update SEO configuration
   */
  async updateSEO(
    restaurantId: string,
    seoUpdates: any,
  ): Promise<BuilderConfiguration['seo']> {
    const config = await this.updateConfig(restaurantId, {
      seo: seoUpdates,
    });
    return config.seo;
  }

  /**
   * Update advanced configuration
   */
  async updateAdvanced(
    restaurantId: string,
    advancedUpdates: any,
  ): Promise<BuilderConfiguration['advanced']> {
    const config = await this.updateConfig(restaurantId, {
      advanced: advancedUpdates,
    });
    return config.advanced;
  }

  /**
   * Publish configuration
   */
  async publishConfig(restaurantId: string): Promise<void> {
    // Verify config exists
    const builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    if (!builderConfig) {
      throw new NotFoundException(
        `No builder configuration found for restaurant ${restaurantId}`,
      );
    }

    const config = builderConfig.config as unknown as BuilderConfiguration;

    // Map builder config to branding V2 format
    const brandingV2 = this.mapBuilderToBranding(config);

    // Update restaurant branding field
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: brandingV2,
        ...(brandingV2.assets?.logo && { logo: brandingV2.assets.logo }),
        ...(brandingV2.assets?.coverImage && {
          coverImage: brandingV2.assets.coverImage,
        }),
      },
    });

    // Mark as published
    await this.prisma.builderConfig.update({
      where: { restaurantId },
      data: {
        isPublished: true,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Published builder config for restaurant ${restaurantId} and synced to branding`,
    );
  }

  /**
   * Unpublish configuration
   */
  async unpublishConfig(restaurantId: string): Promise<void> {
    await this.prisma.builderConfig.update({
      where: { restaurantId },
      data: {
        isPublished: false,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(restaurantId: string): Promise<BuilderConfiguration> {
    const defaultConfig: BuilderConfiguration = {
      ...DEFAULT_BUILDER_CONFIG,
      lastModified: new Date().toISOString(),
    };

    await this.prisma.builderConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        config: defaultConfig as any,
        version: '1.0.0',
      },
      update: {
        config: defaultConfig as any,
        version: '1.0.0',
        isPublished: false,
        updatedAt: new Date(),
      },
    });

    return defaultConfig;
  }

  /**
   * Get published configuration (for public access)
   */
  async getPublishedConfig(
    restaurantId: string,
  ): Promise<BuilderConfiguration | null> {
    const builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    if (!builderConfig || !builderConfig.isPublished) {
      return null;
    }

    return builderConfig.config as unknown as BuilderConfiguration;
  }

  /**
   * Check if restaurant has a builder config
   */
  async hasConfig(restaurantId: string): Promise<boolean> {
    const count = await this.prisma.builderConfig.count({
      where: { restaurantId },
    });
    return count > 0;
  }

  /**
   * Get configuration metadata
   */
  async getConfigMetadata(restaurantId: string): Promise<{
    version: string;
    isPublished: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
  } | null> {
    const builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
      select: {
        version: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
      },
    });

    return builderConfig;
  }

  /**
   * Deep merge utility function
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] === undefined) continue;

      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        // Recursive merge for objects
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        // Direct replacement for primitives and arrays
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Migrate from old branding format to new builder config
   */
  async migrateFromBranding(
    restaurantId: string,
  ): Promise<BuilderConfiguration> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { branding: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    const oldBranding = restaurant.branding as any;
    if (!oldBranding) {
      return this.resetConfig(restaurantId);
    }

    // Map old branding to new builder config
    const newConfig: BuilderConfiguration = {
      ...DEFAULT_BUILDER_CONFIG,
      version: '1.0.0',
      lastModified: new Date().toISOString(),
      theme: {
        colors: {
          primary:
            oldBranding.theme?.colors?.primary ||
            DEFAULT_BUILDER_CONFIG.theme.colors.primary,
          secondary: oldBranding.theme?.colors?.secondary,
          accent: oldBranding.theme?.colors?.accent,
          background: oldBranding.theme?.colors?.background,
          text: oldBranding.theme?.colors?.text,
        },
        typography: {
          fontFamily:
            oldBranding.theme?.typography?.fontFamily ||
            DEFAULT_BUILDER_CONFIG.theme.typography.fontFamily,
        },
        spacing: {
          borderRadius:
            oldBranding.theme?.spacing?.borderRadius ||
            DEFAULT_BUILDER_CONFIG.theme.spacing.borderRadius,
          cardShadow:
            oldBranding.theme?.spacing?.cardShadow ??
            DEFAULT_BUILDER_CONFIG.theme.spacing.cardShadow,
        },
      },
      layout: {
        maxWidth:
          oldBranding.layout?.maxWidth ||
          DEFAULT_BUILDER_CONFIG.layout.maxWidth,
        menuStyle:
          oldBranding.layout?.menuStyle ||
          DEFAULT_BUILDER_CONFIG.layout.menuStyle,
        categoryDisplay:
          oldBranding.layout?.categoryDisplay ||
          DEFAULT_BUILDER_CONFIG.layout.categoryDisplay,
        showHeroSection:
          oldBranding.layout?.showHeroSection ??
          DEFAULT_BUILDER_CONFIG.layout.showHeroSection,
        compactMode:
          oldBranding.layout?.compactMode ??
          DEFAULT_BUILDER_CONFIG.layout.compactMode,
      },
      assets: {
        logo: oldBranding.assets?.logo,
        favicon: oldBranding.assets?.favicon,
        coverImage: oldBranding.assets?.coverImage,
      },
      sections: {
        nav: {
          position: oldBranding.sections?.nav?.position || 'sticky',
          logoSize: oldBranding.sections?.nav?.logoSize || 'md',
          showOpenStatus: oldBranding.sections?.nav?.showOpenStatus ?? true,
          showContactButton:
            oldBranding.sections?.nav?.showContactButton ?? false,
          ...oldBranding.sections?.nav,
        },
        hero: {
          showSection: oldBranding.sections?.hero?.showSection ?? true,
          textAlign: oldBranding.sections?.hero?.textAlign || 'center',
          overlayOpacity: oldBranding.sections?.hero?.overlayOpacity || 40,
          ...oldBranding.sections?.hero,
        },
        menu: {
          cardStyle: oldBranding.sections?.menu?.cardStyle || 'elevated',
          showImages: oldBranding.sections?.menu?.showImages ?? true,
          showPrices: oldBranding.sections?.menu?.showPrices ?? true,
          ...oldBranding.sections?.menu,
        },
        info: {
          showSection: true,
          layout: 'cards',
          ...oldBranding.sections?.info,
        },
        footer: {
          showSection: oldBranding.sections?.footer?.showSection ?? true,
          showSocialLinks:
            oldBranding.sections?.footer?.showSocialLinks ?? true,
          ...oldBranding.sections?.footer,
        },
        cart: {
          style: oldBranding.sections?.cart?.style || 'sidebar',
          position: oldBranding.sections?.cart?.position || 'right',
          ...oldBranding.sections?.cart,
        },
      },
      mobileMenu: oldBranding.mobileMenu,
      advanced: oldBranding.advanced,
    };

    // Save the new config
    await this.prisma.builderConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        config: newConfig as any,
        version: '1.0.0',
      },
      update: {
        config: newConfig as any,
        version: '1.0.0',
        updatedAt: new Date(),
      },
    });

    return newConfig;
  }

  /**
   * Map Builder Configuration to Branding V2 format
   * This is used when publishing to sync builder changes to restaurant.branding
   * Uses safe property access with defaults
   */
  private mapBuilderToBranding(config: BuilderConfiguration): any {
    return {
      theme: {
        colors: {
          primary: config.theme?.colors?.primary || '#3B82F6',
          secondary: config.theme?.colors?.secondary || '#1E40AF',
          accent: config.theme?.colors?.accent || '#F59E0B',
          background: config.theme?.colors?.background || '#FFFFFF',
          text: config.theme?.colors?.text || '#1F2937',
          border: config.theme?.colors?.border || '#E5E7EB',
        },
        typography: {
          fontFamily: config.theme?.typography?.fontFamily || 'Inter',
        },
      },
      assets: {
        logo: config.assets?.logo || '',
        favicon: config.assets?.favicon || '',
        coverImage:
          config.sections?.hero?.backgroundImage ||
          config.assets?.coverImage ||
          '',
      },
      sections: {
        nav: {
          showLogo: config.sections?.nav?.showLogo ?? true,
          showSearch: config.sections?.nav?.showSearchButton ?? true,
          showCart: config.sections?.nav?.showCartButton ?? true,
          transparent: config.sections?.nav?.transparency ?? false,
          sticky: config.sections?.nav?.sticky ?? false,
        },
        hero: {
          showSection: true,
          minHeight: config.sections?.hero?.minHeight || 'lg',
          textAlign: config.sections?.hero?.textAlign || 'center',
          overlay: {
            enabled: true,
            opacity: config.sections?.hero?.overlayOpacity || 40,
          },
          title: {
            text: config.sections?.hero?.title?.text || '',
            color: config.sections?.hero?.title?.color || '#FFFFFF',
          },
          subtitle: {
            text: config.sections?.hero?.subtitle?.text || '',
            color: config.sections?.hero?.subtitle?.color || '#FFFFFF',
          },
          textShadow: config.sections?.hero?.textShadow ?? false,
        },
        menu: {
          layout: 'grid',
          cardStyle: config.sections?.menu?.cardStyle || 'elevated',
          showImages: config.sections?.menu?.showImages ?? true,
          showPrices: config.sections?.menu?.showPrices ?? true,
          showDescriptions: config.sections?.menu?.showDescriptions ?? true,
          showFilters: config.sections?.menu?.showFilters ?? true,
        },
        info: {
          showSection: config.sections?.info?.showSection ?? true,
          showAddress: true,
          showPhone: true,
          showEmail: true,
          showHours: true,
          showMap: true,
          showSocial: true,
        },
        footer: {
          showSection: true,
          variant: config.sections?.footer?.layout || 'simple',
          showLogo: config.sections?.footer?.showLogo ?? true,
          showSocial: true,
          backgroundColor:
            config.sections?.footer?.backgroundColor || '#1F2937',
          textColor: config.sections?.footer?.textColor || '#F9FAFB',
        },
        cart: {
          style: config.sections?.cart?.style || 'drawer',
          position: config.sections?.cart?.position || 'right',
          showThumbnails: true,
        },
      },
      mobileMenu: {
        variant: 'drawer',
        position: config.mobileMenu?.position || 'left',
        showLogo: true,
      },
      advanced: {
        customCSS: config.advanced?.customCSS || '',
        customJS: config.advanced?.customJS || '',
      },
    };
  }
}
