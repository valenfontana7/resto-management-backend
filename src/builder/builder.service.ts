import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BuilderConfiguration,
  BuilderConfigResponse,
  BuilderPreviewBranding,
  BuilderPreviewRestaurant,
  RestaurantDraft,
  RestaurantInfo,
  DEFAULT_BUILDER_CONFIG,
  validateBuilderConfig,
  isValidSectionName,
} from './types/builder-config.types';
import {
  BUILDER_DOC_VERSION_V2,
  ensureBuilderDocumentV2,
  extractPublishBranding,
} from './types/page-doc';
import { UpdateBuilderConfigDto } from './dto/builder-config.dto';
import { normalizeRestaurantDraftPayload } from './utils/restaurant-draft.util';
import { normalizeAssetReference } from './utils/asset-reference.util';
import { MarketingBusinessEventsService } from '../business-events/publishers/marketing-business-events.service';
import { GoLiveEnforcementService } from '../restaurants/services/go-live-enforcement.service';

@Injectable()
export class BuilderService {
  private readonly logger = new Logger(BuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketingEvents: MarketingBusinessEventsService,
    private readonly goLiveEnforcement: GoLiveEnforcementService,
  ) {}

  private readonly restaurantDraftFields: (keyof RestaurantDraft)[] = [
    'name',
    'description',
    'email',
    'phone',
    'address',
    'city',
    'country',
    'postalCode',
    'cuisineTypes',
    'logo',
    'coverImage',
    'type',
    'website',
    'socialMedia',
  ];

  private readonly restaurantInfoSelect = {
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
  } as const;

  /**
   * Get builder configuration for a restaurant.
   * Returns the raw builder config plus two restaurant views:
   * - `restaurant`: preview state with draft fields applied
   * - `publishedRestaurant`: live state from Prisma
   */
  async getConfig(restaurantId: string): Promise<BuilderConfigResponse> {
    const publishedRestaurant =
      await this.getRestaurantInfoOrThrow(restaurantId);

    // Try to get existing config
    const builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    const rawConfig = builderConfig
      ? this.removeRedundantRestaurantDraft(
          builderConfig.config as unknown as BuilderConfiguration,
          publishedRestaurant,
        )
      : { ...DEFAULT_BUILDER_CONFIG, lastModified: new Date().toISOString() };

    const config = ensureBuilderDocumentV2(
      rawConfig as unknown as Record<string, any>,
    ) as BuilderConfiguration;

    const extras = await this.getPreviewExtras(restaurantId);

    return {
      config,
      restaurant: this.buildPreviewRestaurant(
        config,
        publishedRestaurant,
        extras,
      ),
      publishedRestaurant,
    };
  }

  /**
   * Datos extra del restaurante que el builder necesita para que el preview y
   * el checklist de tareas reflejen el estado real (horarios cargados, platos
   * con fotos, etc). Se consultan de Prisma pero NO forman parte de
   * BuilderConfiguration.
   */
  private async getPreviewExtras(restaurantId: string): Promise<{
    hours: Array<{
      dayOfWeek: number;
      isOpen: boolean;
      openTime: string;
      closeTime: string;
    }>;
    categories: Array<{
      id: string;
      name: string;
      description: string | null;
      image: string | null;
      order: number;
      isActive: boolean;
      dishes: Array<{
        id: string;
        name: string;
        description: string | null;
        price: number;
        image: string | null;
        isAvailable: boolean;
        isFeatured: boolean;
      }>;
    }>;
  }> {
    const [hours, categories] = await Promise.all([
      this.prisma.businessHour.findMany({
        where: { restaurantId },
        orderBy: { dayOfWeek: 'asc' },
        select: {
          dayOfWeek: true,
          isOpen: true,
          openTime: true,
          closeTime: true,
        },
      }),
      this.prisma.category.findMany({
        where: { restaurantId, deletedAt: null, isActive: true },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          order: true,
          isActive: true,
          dishes: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
              image: true,
              isAvailable: true,
              isFeatured: true,
            },
          },
        },
      }),
    ]);

    return { hours, categories };
  }

  /**
   * Update builder configuration (partial update with deep merge)
   */
  async updateConfig(
    restaurantId: string,
    updates: UpdateBuilderConfigDto,
    userId?: string,
  ): Promise<BuilderConfiguration> {
    const normalizedUpdates = this.normalizeBuilderConfigInput(updates);

    this.logger.log(`Updating config for restaurant ${restaurantId}`);
    this.logger.debug(`Updates: ${JSON.stringify(normalizedUpdates, null, 2)}`);

    const restaurant = await this.getRestaurantInfoOrThrow(restaurantId);

    // Get existing config or create new one
    let builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    const currentConfig = builderConfig
      ? this.removeRedundantRestaurantDraft(
          builderConfig.config as unknown as BuilderConfiguration,
          restaurant,
        )
      : { ...DEFAULT_BUILDER_CONFIG };

    // Deep merge updates into current config
    const newConfig = this.deepMerge(
      ensureBuilderDocumentV2(currentConfig as unknown as Record<string, any>),
      normalizedUpdates as any,
    );

    // Update lastModified + keep pages/sections in sync (v2)
    newConfig.lastModified = new Date().toISOString();
    const ensuredConfig = ensureBuilderDocumentV2(
      newConfig as unknown as Record<string, any>,
    ) as BuilderConfiguration;

    const sanitizedConfig = this.syncRestaurantDraftMetadata(
      this.removeRedundantRestaurantDraft(ensuredConfig, restaurant),
      restaurant,
      currentConfig,
    );

    // Validate the new config
    const validation = validateBuilderConfig(sanitizedConfig);
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
          config: sanitizedConfig as any,
          version: sanitizedConfig.version || builderConfig.version,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Config updated successfully`);
    } else {
      this.logger.log(`Creating new config for restaurant ${restaurantId}`);

      builderConfig = await this.prisma.builderConfig.create({
        data: {
          restaurantId,
          config: sanitizedConfig as any,
          version: sanitizedConfig.version || '1.0.0',
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
    const normalizedConfig = this.normalizeBuilderConfigInput(config);

    const restaurant = await this.getRestaurantInfoOrThrow(restaurantId);

    const existingBuilderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
      select: { version: true, config: true },
    });

    const configToSave = ensureBuilderDocumentV2(
      this.withRequiredConfigMetadata(
        normalizedConfig,
        existingBuilderConfig?.version,
      ) as unknown as Record<string, any>,
    ) as BuilderConfiguration;

    const sanitizedConfig = this.syncRestaurantDraftMetadata(
      this.removeRedundantRestaurantDraft(configToSave, restaurant),
      restaurant,
      existingBuilderConfig?.config as BuilderConfiguration | undefined,
    );

    // Validate the config
    const validation = validateBuilderConfig(sanitizedConfig);
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
        config: sanitizedConfig as any,
        version: sanitizedConfig.version,
        createdBy: userId,
      },
      update: {
        config: sanitizedConfig as any,
        version: sanitizedConfig.version,
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
        `Invalid section name: ${sectionName}. Valid sections are: nav, hero, menu, info, footer, cart, checkout, orderConfirmation, reservations`,
      );
    }

    const config = await this.updateConfig(restaurantId, {
      sections: {
        [sectionName]: sectionData,
      },
    });

    return config.sections[sectionName];
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
    const restaurant = await this.getRestaurantInfoOrThrow(restaurantId);

    if (!restaurant.isPublished) {
      await this.goLiveEnforcement.assertCanPublish(restaurantId);
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

    const config = ensureBuilderDocumentV2(
      builderConfig.config as unknown as Record<string, any>,
    ) as BuilderConfiguration;

    // 1. Extract branding data (design config, without builder-only fields)
    const rawDraftData = config.restaurant;
    const brandingData = extractPublishBranding(
      config as unknown as Record<string, any>,
    ) as BuilderConfiguration & Record<string, any>;
    const draftData = normalizeRestaurantDraftPayload(rawDraftData) as
      | RestaurantDraft
      | undefined;
    const draftBase = normalizeRestaurantDraftPayload(
      config.metadata?.restaurantDraftBase,
    ) as RestaurantDraft | undefined;
    const publishIssues = this.getPublishReadinessIssues(config);

    if (publishIssues.length > 0) {
      throw new BadRequestException(
        `No se puede publicar hasta corregir: ${publishIssues.join('; ')}`,
      );
    }

    const reconciledDraftBase = draftBase
      ? this.reconcileDraftBaseWithBrandingAssets(
          draftBase,
          brandingData,
          restaurant,
        )
      : undefined;

    const conflictingFields = this.getRestaurantDraftConflictFields(
      draftData,
      reconciledDraftBase,
      restaurant,
    );

    if (conflictingFields.length > 0) {
      throw new ConflictException(
        `Los datos del restaurante cambiaron mientras editabas el builder (${conflictingFields.join(', ')}). Recargá el editor antes de publicar para evitar pisar cambios live.`,
      );
    }

    // Sync hero title.text with restaurant name if not set
    if (
      brandingData.sections?.hero?.title &&
      !brandingData.sections.hero.title.text
    ) {
      brandingData.sections.hero.title.text =
        draftData?.name || restaurant.name;
    }

    // 2. Build Prisma update — apply draft restaurant fields to DB columns
    const restaurantUpdate: Record<string, any> = {
      branding: brandingData as any,
      isPublished: true,
    };

    if (draftData) {
      // Apply each draft field to the corresponding Prisma column
      for (const field of this.restaurantDraftFields) {
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

    // 3. Clear draft restaurant data (already applied), snapshot, mark published
    const cleanedConfig = { ...config };
    delete cleanedConfig.restaurant;

    if (cleanedConfig.metadata?.restaurantDraftBase) {
      const restMetadata = { ...cleanedConfig.metadata };
      delete restMetadata.restaurantDraftBase;
      cleanedConfig.metadata =
        Object.keys(restMetadata).length > 0 ? restMetadata : undefined;
    }

    cleanedConfig.lastModified = new Date().toISOString();
    const publishMetadata = { ...(cleanedConfig.metadata ?? {}) };
    if (!publishMetadata.firstPublishedAt) {
      publishMetadata.firstPublishedAt = new Date().toISOString();
    }
    const previousSnapshots = Array.isArray(publishMetadata.publishSnapshots)
      ? publishMetadata.publishSnapshots
      : [];
    const snapshotId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `snap_${Date.now()}`;
    publishMetadata.publishSnapshots = [
      {
        id: snapshotId,
        createdAt: new Date().toISOString(),
        label: 'Publicación',
        branding: brandingData as Record<string, unknown>,
      },
      ...previousSnapshots,
    ].slice(0, 10);
    cleanedConfig.metadata = publishMetadata;

    await this.prisma.builderConfig.update({
      where: { restaurantId },
      data: {
        config: cleanedConfig as any,
        isPublished: true,
        version: cleanedConfig.version || '2.0.0',
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Published builder config for restaurant ${restaurantId}`);

    this.marketingEvents.publishMarketingPublished({
      restaurantId,
      title: draftData?.name || restaurant.name,
      channel: 'website',
    });
  }

  /**
   * Restore a previous publish snapshot into the draft (and optionally re-publish branding).
   */
  async restorePublishSnapshot(
    restaurantId: string,
    snapshotId: string,
  ): Promise<BuilderConfiguration> {
    const builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });
    if (!builderConfig) {
      throw new NotFoundException('Builder config not found');
    }

    const config = ensureBuilderDocumentV2(
      builderConfig.config as unknown as Record<string, any>,
    ) as BuilderConfiguration;
    const snapshots = config.metadata?.publishSnapshots ?? [];
    const snapshot = snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }

    const branding = snapshot.branding as Record<string, any>;
    const restored = ensureBuilderDocumentV2({
      ...config,
      ...branding,
      version: BUILDER_DOC_VERSION_V2,
      lastModified: new Date().toISOString(),
      metadata: {
        ...(config.metadata ?? {}),
        notes: `Restaurado desde snapshot ${snapshotId}`,
      },
    }) as BuilderConfiguration;

    // Keep restaurant draft out of restored branding payload
    delete (restored as any).restaurant;

    await this.prisma.builderConfig.update({
      where: { restaurantId },
      data: {
        config: restored as any,
        version: restored.version,
        updatedAt: new Date(),
      },
    });

    // Also restore live branding so public site matches immediately
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: extractPublishBranding(
          restored as unknown as Record<string, any>,
        ) as any,
      },
    });

    return restored;
  }

  /**
   * Unpublish configuration
   */
  async unpublishConfig(restaurantId: string): Promise<void> {
    const builderConfig = await this.prisma.builderConfig.findUnique({
      where: { restaurantId },
    });

    if (builderConfig) {
      const config = builderConfig.config as unknown as BuilderConfiguration;
      const metadata = { ...(config.metadata ?? {}) };

      // Backfill for configs published before firstPublishedAt existed.
      if (!metadata.firstPublishedAt) {
        metadata.firstPublishedAt = new Date().toISOString();
      }

      await this.prisma.builderConfig.update({
        where: { restaurantId },
        data: {
          isPublished: false,
          config: { ...config, metadata } as any,
          updatedAt: new Date(),
        },
      });
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        isPublished: false,
      },
    });

    this.marketingEvents.publishMarketingSkipped({
      restaurantId,
      reason: 'site-unpublished',
      source: 'builder.unpublish',
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
    hasPublishedBefore: boolean;
    firstPublishedAt: string | null;
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
        config: true,
      },
    });

    if (!builderConfig) {
      return null;
    }

    const config = builderConfig.config as unknown as BuilderConfiguration;
    const firstPublishedAt = config.metadata?.firstPublishedAt ?? null;

    return {
      version: builderConfig.version,
      isPublished: builderConfig.isPublished,
      hasPublishedBefore:
        Boolean(firstPublishedAt) || builderConfig.isPublished,
      firstPublishedAt,
      createdAt: builderConfig.createdAt,
      updatedAt: builderConfig.updatedAt,
      createdBy: builderConfig.createdBy,
    };
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

  private normalizeBuilderConfigInput<T extends { restaurant?: unknown }>(
    input: T,
  ): T {
    if (!input || input.restaurant === undefined) {
      return input;
    }

    const normalizedRestaurant = normalizeRestaurantDraftPayload(
      input.restaurant,
    );

    if (normalizedRestaurant === input.restaurant) {
      return input;
    }

    return {
      ...input,
      restaurant: normalizedRestaurant,
    };
  }

  private withRequiredConfigMetadata<T extends Partial<BuilderConfiguration>>(
    config: T,
    existingVersion?: string,
  ): T & Pick<BuilderConfiguration, 'version' | 'lastModified'> {
    return {
      ...config,
      version: config.version || existingVersion || '1.0.0',
      lastModified: new Date().toISOString(),
    };
  }

  private async getRestaurantInfoOrThrow(
    restaurantId: string,
  ): Promise<RestaurantInfo> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: this.restaurantInfoSelect,
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    return {
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
      socialMedia:
        (restaurant.socialMedia as Record<string, string>) ?? undefined,
      isPublished: restaurant.isPublished,
    };
  }

  private removeRedundantRestaurantDraft(
    config: BuilderConfiguration,
    restaurant: RestaurantInfo,
  ): BuilderConfiguration {
    const draft = this.pruneRestaurantDraft(config.restaurant, restaurant);

    if (draft === config.restaurant) {
      return config;
    }

    if (!draft) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { restaurant: _restaurant, ...rest } = config;
      return rest as BuilderConfiguration;
    }

    return {
      ...config,
      restaurant: draft,
    };
  }

  private buildPreviewRestaurant(
    config: BuilderConfiguration,
    publishedRestaurant: RestaurantInfo,
    extras?: {
      hours: Array<{
        dayOfWeek: number;
        isOpen: boolean;
        openTime: string;
        closeTime: string;
      }>;
      categories: Array<unknown>;
    },
  ): BuilderPreviewRestaurant {
    const restaurantDraft = config.restaurant;

    const base = {
      ...publishedRestaurant,
      ...restaurantDraft,
      branding: this.buildPreviewBranding(config, {
        ...publishedRestaurant,
        ...restaurantDraft,
      }),
    } as BuilderPreviewRestaurant;

    if (extras) {
      // Inyectamos hours y menu en el preview para que el checklist y el live
      // preview reflejen el contenido real cargado por el dueño.
      (base as unknown as Record<string, unknown>).hours = extras.hours;
      (base as unknown as Record<string, unknown>).menu = {
        categories: extras.categories,
      };
    }

    return base;
  }

  private buildPreviewBranding(
    config: BuilderConfiguration,
    previewRestaurant: RestaurantInfo,
  ): BuilderPreviewBranding {
    // Construir un objeto `branding` a partir de `config` omitiendo claves internas
    const branding = Object.fromEntries(
      Object.entries(config).filter(
        ([k]) =>
          ![
            'restaurant',
            'seo',
            'metadata',
            'version',
            'lastModified',
          ].includes(k),
      ),
    ) as Record<string, unknown>;

    const previewBranding: BuilderPreviewBranding = {
      ...(branding as any),
    };

    if (
      previewBranding.sections?.hero?.title &&
      !previewBranding.sections.hero.title.text
    ) {
      previewBranding.sections = {
        ...previewBranding.sections,
        hero: {
          ...previewBranding.sections.hero,
          title: {
            ...previewBranding.sections.hero.title,
            text: previewRestaurant.name,
          },
        },
      };
    }

    return previewBranding;
  }

  private syncRestaurantDraftMetadata(
    config: BuilderConfiguration,
    restaurant: RestaurantInfo,
    previousConfig?: BuilderConfiguration,
  ): BuilderConfiguration {
    const previousDraftBase = normalizeRestaurantDraftPayload(
      previousConfig?.metadata?.restaurantDraftBase,
    ) as RestaurantDraft | undefined;

    const nextMetadata = {
      ...(previousConfig?.metadata ?? {}),
      ...(config.metadata ?? {}),
    } as NonNullable<BuilderConfiguration['metadata']>;

    if (config.restaurant) {
      nextMetadata.restaurantDraftBase =
        previousConfig?.restaurant && previousDraftBase
          ? this.reconcileDraftBaseWithBrandingAssets(
              previousDraftBase,
              config,
              restaurant,
            )
          : this.buildRestaurantDraftBase(restaurant);
    } else {
      delete nextMetadata.restaurantDraftBase;
    }

    if (Object.keys(nextMetadata).length === 0) {
      const nextConfig = { ...config };
      delete nextConfig.metadata;
      return nextConfig;
    }

    return {
      ...config,
      metadata: nextMetadata,
    };
  }

  private buildRestaurantDraftBase(
    restaurant: RestaurantInfo,
  ): RestaurantDraft {
    return this.restaurantDraftFields.reduce<RestaurantDraft>(
      (result, field) => {
        const value = restaurant[field as keyof RestaurantInfo];

        if (value === undefined) {
          return result;
        }

        if (Array.isArray(value)) {
          (result as Record<string, unknown>)[field] = [...value];
          return result;
        }

        if (value && typeof value === 'object') {
          (result as Record<string, unknown>)[field] = {
            ...value,
          };
          return result;
        }

        (result as Record<string, unknown>)[field] = value;
        return result;
      },
      {},
    );
  }

  private reconcileDraftBaseWithBrandingAssets(
    draftBase: RestaurantDraft,
    config: Pick<BuilderConfiguration, 'assets'>,
    restaurant: RestaurantInfo,
  ): RestaurantDraft {
    const assets = config.assets;
    if (!assets) {
      return draftBase;
    }

    const reconciled: RestaurantDraft = { ...draftBase };

    if (assets.logo !== undefined && restaurant.logo !== undefined) {
      if (
        this.areEquivalentRestaurantValues('logo', restaurant.logo, assets.logo)
      ) {
        reconciled.logo = restaurant.logo;
      }
    }

    const coverAsset = assets.coverImage ?? assets.bannerImage ?? undefined;

    if (coverAsset !== undefined && restaurant.coverImage !== undefined) {
      if (
        this.areEquivalentRestaurantValues(
          'coverImage',
          restaurant.coverImage,
          coverAsset,
        )
      ) {
        reconciled.coverImage = restaurant.coverImage;
      }
    }

    return reconciled;
  }

  private getRestaurantDraftConflictFields(
    draft: RestaurantDraft | undefined,
    draftBase: RestaurantDraft | undefined,
    restaurant: RestaurantInfo,
  ): (keyof RestaurantDraft)[] {
    if (!draft || !draftBase) {
      return [];
    }

    return this.restaurantDraftFields.filter((field) => {
      if (draft[field] === undefined) {
        return false;
      }

      return !this.areEquivalentRestaurantValues(
        field,
        draftBase[field],
        restaurant[field as keyof RestaurantInfo],
      );
    });
  }

  private getPublishReadinessIssues(config: BuilderConfiguration): string[] {
    // Solo errores estructurales del draft: nombre/contacto/menú no bloquean publicar.
    const validation = validateBuilderConfig(config);
    return [
      ...new Set(
        validation.errors.map((error) => `${error.path}: ${error.message}`),
      ),
    ];
  }

  private pruneRestaurantDraft(
    draft: RestaurantDraft | undefined,
    restaurant: RestaurantInfo,
  ): RestaurantDraft | undefined {
    if (!draft) {
      return undefined;
    }

    const cleanedDraft = Object.entries(draft).reduce<RestaurantDraft>(
      (result, [key, value]) => {
        const draftKey = key as keyof RestaurantDraft;
        const liveValue = restaurant[draftKey as keyof RestaurantInfo];

        if (!this.areEquivalentRestaurantValues(draftKey, value, liveValue)) {
          (result as Record<string, unknown>)[draftKey] = value;
        }

        return result;
      },
      {},
    );

    return Object.keys(cleanedDraft).length > 0 ? cleanedDraft : undefined;
  }

  private areEquivalentRestaurantValues(
    field: keyof RestaurantDraft,
    draftValue: unknown,
    liveValue: unknown,
  ): boolean {
    if (field === 'cuisineTypes') {
      return this.areStringArraysEqual(draftValue, liveValue);
    }

    if (field === 'socialMedia') {
      return this.areObjectsEqual(draftValue, liveValue);
    }

    if (field === 'logo' || field === 'coverImage') {
      return (
        normalizeAssetReference(draftValue) ===
        normalizeAssetReference(liveValue)
      );
    }

    return (
      this.normalizeScalarValue(draftValue) ===
      this.normalizeScalarValue(liveValue)
    );
  }

  private normalizeScalarValue(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value ?? undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private extractWebsiteFromSocialMedia(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const website = (value as Record<string, unknown>).website;
    return this.normalizeScalarValue(website) as string | undefined;
  }

  private areStringArraysEqual(left: unknown, right: unknown): boolean {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return left == null && right == null;
    }

    return JSON.stringify(left) === JSON.stringify(right);
  }

  private areObjectsEqual(left: unknown, right: unknown): boolean {
    const normalizedLeft = this.normalizeObjectForCompare(left);
    const normalizedRight = this.normalizeObjectForCompare(right);

    return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
  }

  private normalizeObjectForCompare(
    value: unknown,
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const entry = (value as Record<string, unknown>)[key];
        if (entry !== undefined) {
          result[key] = entry;
        }
        return result;
      }, {});
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
          showSection: oldBranding.sections?.nav?.showSection ?? true,
          position: 'sticky',
          logoSize: oldBranding.sections?.nav?.logoSize || 'md',
          showOpenStatus: oldBranding.sections?.nav?.showOpenStatus ?? true,
          showContactButton:
            oldBranding.sections?.nav?.showContactButton ?? false,
          showQuickLinks: oldBranding.sections?.nav?.showQuickLinks ?? true,
          sticky: oldBranding.sections?.nav?.sticky ?? false,
          ...oldBranding.sections?.nav,
        },
        hero: {
          showSection: oldBranding.sections?.hero?.showSection ?? true,
          textAlign: oldBranding.sections?.hero?.textAlign || 'center',
          minHeight: oldBranding.sections?.hero?.minHeight || 'lg',
          showInfoCards: oldBranding.sections?.hero?.showInfoCards ?? true,
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
          showSection: oldBranding.sections?.menu?.showSection ?? true,
          layout: oldBranding.sections?.menu?.layout || 'grid',
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
        checkout:
          oldBranding.sections?.checkout ||
          DEFAULT_BUILDER_CONFIG.sections.checkout,
        orderConfirmation:
          oldBranding.sections?.orderConfirmation ||
          DEFAULT_BUILDER_CONFIG.sections.orderConfirmation,
        reservations:
          oldBranding.sections?.reservations ||
          DEFAULT_BUILDER_CONFIG.sections.reservations,
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
