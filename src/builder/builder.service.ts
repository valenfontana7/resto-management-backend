import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BuilderConfiguration,
  BuilderConfigResponse,
  RestaurantInfo,
  RestaurantDraft,
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
   * Get builder configuration for a restaurant.
   * Returns the config + restaurant info as separate objects.
   * Restaurant identity data always comes from Prisma (single source of truth).
   */
  async getConfig(restaurantId: string): Promise<BuilderConfigResponse> {
    // Verify restaurant exists and get identity data
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        postalCode: true,
        cuisineTypes: true,
        logo: true,
        coverImage: true,
        type: true,
        website: true,
        socialMedia: true,
        isPublished: true,
      },
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

    const config: BuilderConfiguration = builderConfig
      ? (builderConfig.config as unknown as BuilderConfiguration)
      : { ...DEFAULT_BUILDER_CONFIG, lastModified: new Date().toISOString() };

    return {
      config,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        description: restaurant.description ?? undefined,
        email: restaurant.email,
        phone: restaurant.phone ?? undefined,
        address: restaurant.address ?? undefined,
        city: restaurant.city ?? undefined,
        country: restaurant.country ?? undefined,
        postalCode: restaurant.postalCode ?? undefined,
        cuisineTypes: restaurant.cuisineTypes || [],
        logo: restaurant.logo ?? undefined,
        coverImage: restaurant.coverImage ?? undefined,
        type: restaurant.type ?? undefined,
        website: restaurant.website ?? undefined,
        socialMedia: (restaurant.socialMedia as Record<string, string>) ?? undefined,
        isPublished: restaurant.isPublished,
      },
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
    const newConfig = this.deepMerge(currentConfig, updates as any);

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
   * Publish configuration.
   * 1. Copies design config (theme, layout, assets, sections, etc.) → restaurant.branding
   * 2. Applies restaurant draft fields (config.restaurant) → Prisma Restaurant columns
   * 3. Clears config.restaurant draft after applying (ya está publicado)
   */
  async publishConfig(restaurantId: string): Promise<void> {
    // Verify restaurant exists
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant ${restaurantId} not found`,
      );
    }

    // Get or create builder config
    let builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    if (!builderConfig) {
      this.logger.log(
        `No builder config found for restaurant ${restaurantId}, creating default config`,
      );

      const defaultConfig: BuilderConfiguration = {
        ...DEFAULT_BUILDER_CONFIG,
        lastModified: new Date().toISOString(),
      };

      builderConfig = await this.prisma.builderConfig.create({
        data: {
          restaurantId,
          config: defaultConfig as any,
          version: '1.0.0',
          isPublished: false,
        },
      });
    }

    const config = builderConfig.config as unknown as BuilderConfiguration;

    // 1. Extract branding data (design config, without builder-only fields)
    const { version, lastModified, seo, metadata, restaurant: draftData, ...brandingData } = config;

    // Sync hero title.text with restaurant name if not set
    if (brandingData.sections?.hero?.title && !brandingData.sections.hero.title.text) {
      brandingData.sections.hero.title.text = draftData?.name || restaurant.name;
    }

    // 2. Build Prisma update — apply draft restaurant fields to DB columns
    const restaurantUpdate: Record<string, any> = {
      branding: brandingData as any,
      isPublished: true,
    };

    if (draftData) {
      // Apply each draft field to the corresponding Prisma column
      const draftFields: (keyof RestaurantDraft)[] = [
        'name', 'description', 'email', 'phone', 'address',
        'city', 'country', 'postalCode', 'cuisineTypes',
        'logo', 'coverImage', 'type', 'website', 'socialMedia',
      ];

      for (const field of draftFields) {
        if (draftData[field] !== undefined) {
          restaurantUpdate[field] = draftData[field];
        }
      }

      this.logger.log(
        `Applying draft restaurant fields: ${Object.keys(draftData).join(', ')}`,
      );
    }

    // Also sync logo/coverImage from assets if present
    if (brandingData.assets?.logo && !restaurantUpdate.logo) {
      restaurantUpdate.logo = brandingData.assets.logo;
    }
    if (brandingData.assets?.coverImage && !restaurantUpdate.coverImage) {
      restaurantUpdate.coverImage = brandingData.assets.coverImage;
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: restaurantUpdate,
    });

    // 3. Clear draft restaurant data (already applied) and mark as published
    const cleanedConfig = { ...config };
    delete cleanedConfig.restaurant;
    cleanedConfig.lastModified = new Date().toISOString();

    await this.prisma.builderConfig.update({
      where: { restaurantId },
      data: {
        config: cleanedConfig as any,
        isPublished: true,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Published builder config for restaurant ${restaurantId}`,
    );
  }

  /**
   * Unpublish configuration
   */
  async unpublishConfig(restaurantId: string): Promise<void> {
    // Update builder config
    await this.prisma.builderConfig.update({
      where: { restaurantId },
      data: {
        isPublished: false,
        updatedAt: new Date(),
      },
    });

    // Update restaurant publish status
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        isPublished: false,
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

    // Map old branding to unified builder config (same shape as branding V2)
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
          muted: oldBranding.theme?.colors?.muted,
        },
        typography: {
          fontFamily:
            oldBranding.theme?.typography?.fontFamily ||
            DEFAULT_BUILDER_CONFIG.theme.typography.fontFamily,
          headingFontFamily: oldBranding.theme?.typography?.headingFontFamily,
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
          position: 'sticky',
          logoSize: oldBranding.sections?.nav?.logoSize || 'md',
          showOpenStatus: oldBranding.sections?.nav?.showOpenStatus ?? true,
          showContactButton:
            oldBranding.sections?.nav?.showContactButton ?? true,
          sticky: oldBranding.sections?.nav?.sticky ?? false,
          ...oldBranding.sections?.nav,
        },
        hero: {
          showSection: oldBranding.sections?.hero?.showSection ?? true,
          textAlign: oldBranding.sections?.hero?.textAlign || 'center',
          minHeight: oldBranding.sections?.hero?.minHeight || 'lg',
          overlay: {
            enabled: oldBranding.sections?.hero?.overlay?.enabled ?? false,
            color: oldBranding.sections?.hero?.overlay?.color,
            opacity: oldBranding.sections?.hero?.overlay?.opacity ?? 0,
          },
          textShadow: oldBranding.sections?.hero?.textShadow ?? false,
          title: oldBranding.sections?.hero?.title,
          subtitle: oldBranding.sections?.hero?.subtitle,
        },
        menu: {
          cardStyle: oldBranding.sections?.menu?.cardStyle || 'elevated',
          showImages: oldBranding.sections?.menu?.showImages ?? true,
          showPrices: oldBranding.sections?.menu?.showPrices ?? true,
          columns: oldBranding.sections?.menu?.columns || 3,
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
          layout: oldBranding.sections?.footer?.layout || 'simple',
          ...oldBranding.sections?.footer,
        },
        cart: {
          style: oldBranding.sections?.cart?.style || 'drawer',
          position: oldBranding.sections?.cart?.position || 'right',
          ...oldBranding.sections?.cart,
        },
        checkout: oldBranding.sections?.checkout || DEFAULT_BUILDER_CONFIG.sections.checkout,
        reservations: oldBranding.sections?.reservations || DEFAULT_BUILDER_CONFIG.sections.reservations,
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
}
