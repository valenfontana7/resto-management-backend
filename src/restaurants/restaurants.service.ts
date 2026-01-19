import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateBrandingDto,
  UpdatePaymentMethodsDto,
  UpdateDeliveryZonesDto,
} from './dto/restaurant-settings.dto';
import * as path from 'path';
import { S3Service } from '../storage/s3.service';
import { RestaurantUsersService } from './services/restaurant-users.service';
import { RestaurantBrandingService } from './services/restaurant-branding.service';
import { RestaurantSettingsService } from './services/restaurant-settings.service';
import { RestaurantStatus } from '@prisma/client';

@Injectable()
export class RestaurantsService {
  constructor(
    private prisma: PrismaService,
    private readonly s3: S3Service,
    @Inject(forwardRef(() => RestaurantUsersService))
    private readonly usersService: RestaurantUsersService,
    @Inject(forwardRef(() => RestaurantBrandingService))
    private readonly brandingService: RestaurantBrandingService,
    @Inject(forwardRef(() => RestaurantSettingsService))
    private readonly settingsService: RestaurantSettingsService,
  ) {}

  async findBySlug(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
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
        logo: true,
        coverImage: true,
        taxId: true,
        minOrderAmount: true,
        orderLeadTime: true,
        branding: true,
        features: true,
        socialMedia: true,
        hours: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.mapRestaurantForClient(restaurant);
  }

  async findById(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
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
        logo: true,
        coverImage: true,
        taxId: true,
        minOrderAmount: true,
        orderLeadTime: true,
        branding: true,
        features: true,
        socialMedia: true,
        hours: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${id} not found`);
    }

    return this.mapRestaurantForClient(restaurant);
  }

  private mapRestaurantForClient<T extends Record<string, any> | null>(
    restaurant: T,
  ): T {
    if (!restaurant) return restaurant;

    const mapped: any = { ...restaurant };

    if ('logo' in mapped) mapped.logo = this.s3.toClientUrl(mapped.logo);
    if ('coverImage' in mapped)
      mapped.coverImage = this.s3.toClientUrl(mapped.coverImage);

    if (mapped.branding && typeof mapped.branding === 'object') {
      const branding: any = { ...mapped.branding };
      if ('logo' in branding)
        branding.logo = this.s3.toClientUrl(branding.logo);
      if ('bannerImage' in branding)
        branding.bannerImage = this.s3.toClientUrl(branding.bannerImage);
      if ('coverImage' in branding)
        branding.coverImage = this.s3.toClientUrl(branding.coverImage);
      mapped.branding = branding;
    }

    return mapped;
  }

  /**
   * @deprecated Usa RestaurantSettingsService.logVisit() directamente
   */
  async logVisit(
    restaurantId: string,
    meta?: {
      ip?: string | null;
      userAgent?: string | null;
      referrer?: string | null;
    },
  ) {
    return this.settingsService.logVisit(restaurantId, meta);
  }

  async getVisitsCount(restaurantId: string, from?: Date, to?: Date) {
    const wherePrisma: any = { restaurantId, metric: 'page_view' };
    if (from || to) wherePrisma.date = {};
    if (from) wherePrisma.date.gte = from;
    if (to) wherePrisma.date.lte = to;

    return this.prisma.analytics.count({ where: wherePrisma });
  }

  private normalizeBrandingForResponse(branding: any) {
    if (!branding || typeof branding !== 'object') return branding;
    const out = { ...branding };
    try {
      if ('hero' in out) {
        out.hero = this.normalizeHero(out.hero);
      }
      if ('layout' in out) {
        out.layout = this.normalizeLayout(out.layout);
      }
      // Add normalization for new sections if needed
      // For now, they pass through as-is since they don't have complex validation
    } catch {
      // swallow - be permissive on read
      out.hero = out.hero || null;
      out.layout = out.layout || null;
    }

    // Resolver solo strings que parecen referencias a assets (keys / URLs / proxy)
    const traverse = (node: any): any => {
      if (node === null || node === undefined) return node;
      if (typeof node === 'string') {
        return this.resolveAssetStringForClient(node);
      }
      if (Array.isArray(node)) return node.map(traverse);
      if (typeof node === 'object') {
        const o: any = {};
        for (const k of Object.keys(node)) o[k] = traverse(node[k]);
        return o;
      }
      return node;
    };

    return traverse(out);
  }

  private resolveAssetStringForClient(value: string): string | null {
    const v = String(value ?? '').trim();
    if (!v) return value;

    if (v.startsWith('/api/uploads/')) return v;
    if (/^https?:\/\//i.test(v)) return v;

    // No tolerar rutas locales legacy
    if (v.startsWith('/uploads/')) return null;

    // Keys típicas que guardamos en DB
    const looksLikeKey =
      /^(dishes|categories|restaurants|images|branding)\/.+\.(jpg|jpeg|png|webp|gif|svg)$/i.test(
        v,
      );
    if (looksLikeKey) return this.s3.buildProxyUrl(v);

    return value;
  }

  async create(payload: any) {
    // Support both old structure (config/businessInfo) and new structure (onboardingData)
    const data = payload.onboardingData || payload.config || payload;

    // Map frontend field names to backend field names
    const businessInfo = data.businessInfo || {};
    const restaurantName = businessInfo.restaurantName || businessInfo.name;

    if (!restaurantName) {
      throw new Error('Restaurant name is required');
    }

    const contact = data.contact || {};
    const branding = data.branding || {
      colors: {
        primary: '#000000',
        secondary: '#6b7280',
        accent: '#9ca3af',
        text: '#000000',
        background: '#ffffff',
      },
      layout: {
        menuStyle: 'grid',
        categoryDisplay: 'tabs',
        showHeroSection: true,
      },
      typography: {
        fontFamily: 'Inter',
        fontSize: 'md',
      },
      hero: {
        minHeight: 'md',
        textAlign: 'center',
        textShadow: false,
        overlayColor: '#000000',
        overlayOpacity: 0,
        metaTextColor: '#0f172a',
        descriptionColor: '#0f172a',
        titleColor: '#0f172a',
      },
      cart: {
        backgroundColor: '#ffffff',
        textColor: '#000000',
        borderRadius: 'md',
        shadow: false,
      },
      menu: {
        backgroundColor: '#ffffff',
        textColor: '#000000',
        cardShadow: false,
        borderRadius: 'md',
      },
      footer: {
        backgroundColor: '#f9fafb',
        textColor: '#000000',
        showSocialLinks: false,
      },
      checkout: {
        backgroundColor: '#ffffff',
        textColor: '#000000',
        buttonStyle: 'solid',
        shadow: false,
      },
      reservations: {
        backgroundColor: '#ffffff',
        textColor: '#000000',
        formStyle: 'minimal',
        shadow: false,
      },
    };
    const businessRules = data.businessRules || {
      orders: {
        minOrderAmount: 1000,
        orderLeadTime: 30,
      },
    };
    const features = data.features || {
      onlineOrdering: true,
      reservations: true,
      delivery: false,
      takeaway: true,
    };
    const hours = data.hours || {};

    const hoursData: any[] = [];
    const daysMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    if (hours && Object.keys(hours).length > 0) {
      for (const [day, schedule] of Object.entries(hours)) {
        if (daysMap[day] !== undefined) {
          hoursData.push({
            dayOfWeek: daysMap[day],
            openTime: (schedule as any).openTime || '09:00',
            closeTime: (schedule as any).closeTime || '22:00',
            isOpen: (schedule as any).isOpen !== false,
          });
        }
      }
    }

    // Use customSlug if provided, otherwise generate from name
    const slug =
      contact.customSlug || data.slug || this.generateSlug(restaurantName);

    const existingRestaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
    });

    if (existingRestaurant) {
      throw new ConflictException(
        `Restaurant with slug "${slug}" already exists`,
      );
    }

    // Create restaurant with system roles in a transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Create restaurant
      const restaurant = await tx.restaurant.create({
        data: {
          slug,
          name: restaurantName,
          type: businessInfo.businessType || businessInfo.type || 'restaurant',
          cuisineTypes: businessInfo.cuisine || businessInfo.cuisineTypes || [],
          description: businessInfo.description || '',

          email: contact.email || '',
          phone: contact.phone || '',
          address: contact.address || '',
          city: contact.city || '',
          country: contact.country || '',
          postalCode: contact.postalCode || '',

          branding: {
            colors: branding.colors || {
              primary: '#000000',
              secondary: '#6b7280',
              accent: '#9ca3af',
              text: '#000000',
              background: '#ffffff',
            },
            layout: branding.layout || {
              menuStyle: 'grid',
              categoryDisplay: 'tabs',
              showHeroSection: true,
            },
            typography: branding.typography || {
              fontFamily: 'Inter',
              fontSize: 'md',
            },
            hero: branding.hero || {
              minHeight: 'md',
              textAlign: 'center',
              textShadow: false,
              overlayColor: '#000000',
              overlayOpacity: 0,
              metaTextColor: '#0f172a',
              descriptionColor: '#0f172a',
              titleColor: '#0f172a',
            },
            cart: branding.cart || {
              backgroundColor: '#ffffff',
              textColor: '#000000',
              borderRadius: 'md',
              shadow: false,
            },
            menu: branding.menu || {
              backgroundColor: '#ffffff',
              textColor: '#000000',
              cardShadow: false,
              borderRadius: 'md',
            },
            footer: branding.footer || {
              backgroundColor: '#f9fafb',
              textColor: '#000000',
              showSocialLinks: false,
            },
            checkout: branding.checkout || {
              backgroundColor: '#ffffff',
              textColor: '#000000',
              buttonStyle: 'solid',
              shadow: false,
            },
            reservations: branding.reservations || {
              backgroundColor: '#ffffff',
              textColor: '#000000',
              formStyle: 'minimal',
              shadow: false,
            },
          },

          features: features,

          socialMedia: {},

          minOrderAmount: businessRules.orders?.minOrderAmount || 1000,
          orderLeadTime: businessRules.orders?.orderLeadTime || 30,

          hours:
            hoursData.length > 0
              ? {
                  create: hoursData,
                }
              : undefined,
        },
      });

      // 2. Create system roles
      await tx.role.createMany({
        data: [
          {
            restaurantId: restaurant.id,
            name: 'Admin',
            permissions: ['all'],
            color: '#ef4444',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Manager',
            permissions: [
              'manage_menu',
              'manage_orders',
              'view_reports',
              'manage_tables',
              'manage_reservations',
            ],
            color: '#f59e0b',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Waiter',
            permissions: ['take_orders', 'manage_orders', 'view_tables'],
            color: '#3b82f6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Kitchen',
            permissions: ['view_orders', 'update_order_status'],
            color: '#8b5cf6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Delivery',
            permissions: ['view_delivery_orders', 'update_delivery_status'],
            color: '#10b981',
            isSystemRole: true,
          },
        ],
      });

      return restaurant;
    });
  }

  async associateUserWithRestaurant(userId: string, restaurantId: string) {
    // Find the Admin role for this restaurant
    const adminRole = await this.prisma.role.findFirst({
      where: {
        restaurantId,
        name: 'Admin',
        isSystemRole: true,
      },
    });

    if (!adminRole) {
      throw new NotFoundException('Admin role not found for this restaurant');
    }

    // Update user to associate with restaurant and Admin role
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        restaurantId,
        roleId: adminRole.id,
      },
    });
  }

  async update(id: string, payload: any) {
    const updateData: any = {};

    // Get current restaurant data for deep merge
    const currentRestaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!currentRestaurant) {
      throw new NotFoundException(`Restaurant with ID ${id} not found`);
    }

    // Handle branding with deep merge
    if (payload.branding !== undefined) {
      const incomingBranding =
        typeof payload.branding === 'string'
          ? JSON.parse(payload.branding)
          : payload.branding;

      // Accept flat legacy keys and normalize into nested `branding` structure
      const normalizeFlatToNested = (b: any) => {
        if (!b || typeof b !== 'object') return b;
        const out = { ...b };

        const map: Record<string, string[]> = {
          hero_overlayOpacity: ['hero', 'overlayOpacity'],
          hero_overlay_opacity: ['hero', 'overlayOpacity'],
          hero_overlayColor: ['hero', 'overlayColor'],
          hero_overlay_color: ['hero', 'overlayColor'],
          hero_textShadow: ['hero', 'textShadow'],
          hero_text_shadow: ['hero', 'textShadow'],
          hero_textAlign: ['hero', 'textAlign'],
          hero_text_align: ['hero', 'textAlign'],
          hero_minHeight: ['hero', 'minHeight'],
          hero_min_height: ['hero', 'minHeight'],
          sections_hero_titleColor: ['sections', 'hero', 'titleColor'],
          sections_hero_title_color: ['sections', 'hero', 'titleColor'],
          sections_hero_descriptionColor: [
            'sections',
            'hero',
            'descriptionColor',
          ],
          sections_hero_description_color: [
            'sections',
            'hero',
            'descriptionColor',
          ],
          // single flag for meta text (rating, min delivery, location, hours)
          hero_metaTextColor: ['hero', 'metaTextColor'],
          hero_meta_text_color: ['hero', 'metaTextColor'],
          sections_hero_metaTextColor: ['sections', 'hero', 'metaTextColor'],
          sections_hero_meta_text_color: ['sections', 'hero', 'metaTextColor'],
        };

        for (const k of Object.keys(map)) {
          if (k in out) {
            const path = map[k];
            // ensure root `sections` etc exist
            if (path[0] === 'sections') {
              out.sections = out.sections || {};
            }
            // build nested structure
            let parent: any = out;
            for (let i = 0; i < path.length - 1; i++) {
              const p = path[i];
              parent[p] = parent[p] || {};
              parent = parent[p];
            }
            parent[path[path.length - 1]] = out[k];
            delete out[k];
          }
        }

        return out;
      };

      const normalizedFlat = normalizeFlatToNested(incomingBranding);

      const currentBranding = (currentRestaurant.branding as any) || {};

      // Sanitize incoming branding to convert {} placeholders to null for primitive fields
      const sanitized = this.sanitizeBrandingInput(normalizedFlat);

      // Merge nested objects safely, prioritizing incoming values when present
      const mergedBranding: any = {
        ...currentBranding,
        ...sanitized,
        colors: {
          ...(currentBranding.colors || {}),
          ...(sanitized.colors || {}),
        },
        layout: {
          ...(currentBranding.layout || {}),
          ...(sanitized.layout || {}),
        },
        typography: {
          ...(currentBranding.typography || {}),
          ...(sanitized.typography || {}),
        },
        hero: {
          ...(currentBranding.hero || {}),
          ...(sanitized.hero || {}),
        },
        visual: {
          ...(currentBranding.visual || {}),
          ...(sanitized.visual || {}),
        },
        sections: {
          hero: {
            ...(currentBranding.sections?.hero || {}),
            ...(sanitized.sections?.hero || {}),
          },
          menu: {
            ...(currentBranding.sections?.menu || {}),
            ...(sanitized.sections?.menu || {}),
          },
          footer: {
            ...(currentBranding.sections?.footer || {}),
            ...(sanitized.sections?.footer || {}),
          },
          ...(currentBranding.sections || {}),
          ...(sanitized.sections || {}),
        },
        cart: {
          ...(currentBranding.cart || {}),
          ...(sanitized.cart || {}),
        },
        menu: {
          ...(currentBranding.menu || {}),
          ...(sanitized.menu || {}),
        },
        footer: {
          ...(currentBranding.footer || {}),
          ...(sanitized.footer || {}),
        },
        checkout: {
          ...(currentBranding.checkout || {}),
          ...(sanitized.checkout || {}),
        },
        reservations: {
          ...(currentBranding.reservations || {}),
          ...(sanitized.reservations || {}),
        },
        mobileMenu: {
          ...(currentBranding.mobileMenu || {}),
          ...(sanitized.mobileMenu || {}),
          // Preserve items array if not explicitly sent in update
          items:
            sanitized.mobileMenu?.items !== undefined
              ? sanitized.mobileMenu.items
              : currentBranding.mobileMenu?.items,
        },
      };

      updateData.branding = mergedBranding;
    }

    if (payload.features !== undefined) {
      updateData.features =
        typeof payload.features === 'string'
          ? JSON.parse(payload.features)
          : payload.features;
    }

    if (payload.socialMedia !== undefined) {
      updateData.socialMedia =
        typeof payload.socialMedia === 'string'
          ? JSON.parse(payload.socialMedia)
          : payload.socialMedia;
    }

    if (payload.businessRules !== undefined) {
      updateData.businessRules =
        typeof payload.businessRules === 'string'
          ? JSON.parse(payload.businessRules)
          : payload.businessRules;
    }

    if (payload.hours !== undefined) {
      // Handle hours update - convert object format to array format expected by settings service
      const hoursData = this.convertHoursObjectToArray(payload.hours);
      await this.settingsService.updateHours(id, hoursData);
      // Don't include hours in updateData since it's handled separately
    }

    // Handle legacy fields for backwards compatibility
    const { businessInfo, contact, taxId } = payload;

    if (businessInfo) {
      if (businessInfo.name) updateData.name = businessInfo.name;
      if (businessInfo.slug) {
        // Validate slug uniqueness
        const existing = await this.prisma.restaurant.findFirst({
          where: { slug: businessInfo.slug, id: { not: id } },
        });
        if (existing) {
          throw new BadRequestException('Slug already in use');
        }
        updateData.slug = businessInfo.slug;
      }
      if (businessInfo.type) updateData.type = businessInfo.type;
      if (businessInfo.cuisineTypes)
        updateData.cuisineTypes = businessInfo.cuisineTypes;
      if (businessInfo.description)
        updateData.description = businessInfo.description;
      if (businessInfo.logo !== undefined) updateData.logo = businessInfo.logo;
      if (businessInfo.coverImage !== undefined)
        updateData.coverImage = businessInfo.coverImage;
    }

    if (contact) {
      if (contact.email) updateData.email = contact.email;
      if (contact.phone) updateData.phone = contact.phone;
      if (contact.address) updateData.address = contact.address;
      if (contact.city) updateData.city = contact.city;
      if (contact.country) updateData.country = contact.country;
      if (contact.postalCode) updateData.postalCode = contact.postalCode;
      if (contact.website !== undefined) updateData.website = contact.website;
    }

    // Tax ID (CUIT/CUIL)
    if (taxId !== undefined) {
      updateData.taxId = taxId;
    }

    console.log(
      '📝 Updating restaurant with data:',
      JSON.stringify(updateData, null, 2),
    );

    // Process embedded base64 assets in branding (hero, sections, etc.)
    // Normalize/validate hero and layout primitives before asset processing
    if (updateData.branding) {
      if (updateData.branding.hero !== undefined) {
        updateData.branding.hero = this.normalizeHero(updateData.branding.hero);
      }
      if (updateData.branding.layout !== undefined) {
        updateData.branding.layout = this.normalizeLayout(
          updateData.branding.layout,
        );
      }

      try {
        updateData.branding = await this.processBrandingAssets(
          id,
          updateData.branding,
          currentRestaurant.branding as any,
        );
      } catch (err) {
        console.error('Error processing branding assets:', err.message || err);
        throw err;
      }
    }

    // Handle top-level logo/coverImage if provided as data URLs
    if (
      updateData.logo &&
      typeof updateData.logo === 'string' &&
      updateData.logo.startsWith('data:')
    ) {
      // delete previous logo
      this.deleteFileIfExists(currentRestaurant.logo);
      updateData.logo = await this.saveDataUrl(id, updateData.logo, 'logo');
    }

    if (
      updateData.coverImage &&
      typeof updateData.coverImage === 'string' &&
      updateData.coverImage.startsWith('data:')
    ) {
      this.deleteFileIfExists(currentRestaurant.coverImage);
      updateData.coverImage = await this.saveDataUrl(
        id,
        updateData.coverImage,
        'cover',
      );
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: updateData,
      include: {
        hours: true,
      },
    });

    console.log(
      '🔁 raw updated from prisma (post-update):',
      JSON.stringify(updated.branding, null, 2),
    );
    console.log('✅ Restaurant updated:', {
      id: updated.id,
      hasBranding: !!updated.branding,
      brandingKeys: updated.branding
        ? Object.keys(updated.branding as object)
        : [],
      branding: updated.branding,
    });

    return updated;
  }

  /**
   * @deprecated Usa RestaurantSettingsService.updateHours() directamente
   */
  async updateHours(id: string, hours: any[]) {
    return this.settingsService.updateHours(id, hours);
  }

  private convertHoursObjectToArray(hours: any): any[] {
    const hoursData: any[] = [];
    const daysMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    if (hours && Object.keys(hours).length > 0) {
      for (const [day, schedule] of Object.entries(hours)) {
        if (daysMap[day] !== undefined) {
          hoursData.push({
            dayOfWeek: daysMap[day],
            openTime: (schedule as any).openTime || '09:00',
            closeTime: (schedule as any).closeTime || '22:00',
            isOpen: (schedule as any).isOpen !== false,
          });
        }
      }
    }

    return hoursData;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async saveDataUrl(
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

    // Guardar key en DB
    return uploaded.key;
  }

  private deleteFileIfExists(p?: string | null) {
    try {
      if (!p) return;

      // Convertir proxy URL a key
      const asString = String(p);
      const key = asString.startsWith('/api/uploads/')
        ? asString.replace(/^\/api\/uploads\//, '').split('?')[0]
        : asString;

      // No borrar rutas locales legacy
      if (key.startsWith('/uploads/')) return;

      // Best-effort delete en Spaces
      void this.s3.deleteObjectByUrl(key);
    } catch {
      // ignore
    }
  }

  private async processBrandingAssets(
    restaurantId: string,
    branding: any,
    currentBranding: any,
  ): Promise<any> {
    if (!branding || typeof branding !== 'object') return branding;

    const traverse = async (
      node: any,
      curNode: any,
      pathKeys: string[] = [],
    ) => {
      if (node === null || node === undefined) return node;
      // Preserve primitive values (boolean, number, etc.) as-is
      if (typeof node !== 'object') return node;

      if (typeof node === 'string') {
        if (node.startsWith('data:')) {
          // find previous value at same path
          let prev = curNode;
          for (const k of pathKeys) {
            if (!prev) break;
            prev = prev[k];
          }
          if (prev && typeof prev === 'string' && !prev.startsWith('data:')) {
            this.deleteFileIfExists(prev);
          }
          const saved = await this.saveDataUrl(
            restaurantId,
            node,
            pathKeys[pathKeys.length - 1] || 'asset',
          );
          return saved;
        }
        return node;
      }

      if (Array.isArray(node)) {
        const out = [] as any[];
        for (let i = 0; i < node.length; i++) {
          out[i] = await traverse(node[i], curNode && curNode[i], [
            ...pathKeys,
            String(i),
          ]);
        }
        return out;
      }

      // object
      const result: any = {};
      for (const key of Object.keys(node)) {
        result[key] = await traverse(node[key], curNode && curNode[key], [
          ...pathKeys,
          key,
        ]);
      }
      return result;
    };

    return traverse(branding, currentBranding, []);
  }

  private coerceBooleanField(value: any) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
    }
    // Coerce unexpected types (e.g. {}) to null for compatibility
    return null;
  }

  private coerceOverlayOpacity(value: any) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      const n = Math.floor(value);
      return Math.max(0, Math.min(100, n));
    }
    if (typeof value === 'string') {
      const digits = value.trim();
      if (/^-?\d+$/.test(digits)) {
        const n = Math.floor(parseInt(digits, 10));
        return Math.max(0, Math.min(100, n));
      }
    }
    // Coerce unexpected types to null for compatibility
    return null;
  }

  private validateHexColor(value: any) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
    return null;
  }

  private normalizeHero(hero: any) {
    if (hero === null || hero === undefined) return null;
    if (typeof hero !== 'object' || Array.isArray(hero)) {
      // Coerce invalid hero shapes to null for compatibility
      return null;
    }

    const out: any = {};

    // overlayOpacity
    if ('overlayOpacity' in hero) {
      out.overlayOpacity = this.coerceOverlayOpacity(hero.overlayOpacity);
    }

    // overlayColor
    if ('overlayColor' in hero) {
      out.overlayColor = this.validateHexColor(hero.overlayColor);
    }

    // metaTextColor (single flag for rating/min delivery/location/horarios)
    if ('metaTextColor' in hero) {
      out.metaTextColor = this.validateHexColor(hero.metaTextColor);
    }

    // textShadow
    if ('textShadow' in hero) {
      out.textShadow = this.coerceBooleanField(hero.textShadow);
    }

    // textAlign
    if ('textAlign' in hero) {
      const val = hero.textAlign;
      if (val === null) {
        out.textAlign = null;
      } else if (
        typeof val === 'string' &&
        ['left', 'center', 'right'].includes(val)
      ) {
        out.textAlign = val;
      } else {
        out.textAlign = null;
      }
    }

    // minHeight
    if ('minHeight' in hero) {
      const val = hero.minHeight;
      if (val === null) {
        out.minHeight = null;
      } else if (
        typeof val === 'string' &&
        ['sm', 'md', 'lg', 'xl'].includes(val)
      ) {
        out.minHeight = val;
      } else {
        out.minHeight = null;
      }
    }

    // Keep other hero fields as-is if they exist but ensure primitives aren't objects
    for (const k of Object.keys(hero)) {
      if (
        ![
          'overlayOpacity',
          'overlayColor',
          'textShadow',
          'textAlign',
          'minHeight',
        ].includes(k)
      ) {
        const v = hero[k];
        if (v !== null && typeof v === 'object') {
          out[k] = null;
        } else {
          out[k] = v;
        }
      }
    }

    return out;
  }

  private normalizeLayout(layout: any) {
    if (layout === null || layout === undefined) return null;
    if (typeof layout !== 'object' || Array.isArray(layout)) {
      throw new BadRequestException(
        'branding.layout must be an object or null',
      );
    }

    const out: any = { ...layout };
    const boolFields = ['showHeroSection', 'showStats', 'compactMode'];
    for (const f of boolFields) {
      if (f in layout) {
        out[f] = this.coerceBooleanField(layout[f]);
      }
    }
    return out;
  }

  private sanitizeBrandingInput(branding: any) {
    if (!branding || typeof branding !== 'object') return branding;
    const out = { ...branding };

    // sanitize hero
    if (out.hero && typeof out.hero === 'object') {
      const h = { ...out.hero };
      if (
        'overlayOpacity' in h &&
        (h.overlayOpacity === null || typeof h.overlayOpacity === 'object')
      ) {
        h.overlayOpacity = null;
      }
      if (
        'textShadow' in h &&
        (h.textShadow === null || typeof h.textShadow === 'object')
      ) {
        h.textShadow = null;
      }
      if ('textAlign' in h && typeof h.textAlign === 'object') {
        h.textAlign = null;
      }
      if ('minHeight' in h && typeof h.minHeight === 'object') {
        h.minHeight = null;
      }
      out.hero = h;
    }

    // sanitize layout booleans
    if (out.layout && typeof out.layout === 'object') {
      const l = { ...out.layout };
      for (const f of ['showHeroSection', 'showStats', 'compactMode']) {
        if (f in l && typeof l[f] === 'object') l[f] = null;
      }
      out.layout = l;
    }

    return out;
  }

  /**
   * @deprecated Usa RestaurantBrandingService.updateBranding() directamente
   */
  async updateBranding(id: string, branding: UpdateBrandingDto) {
    return this.brandingService.updateBranding(id, branding);
  }

  /**
   * @deprecated Usa RestaurantSettingsService.updatePaymentMethods() directamente
   */
  async updatePaymentMethods(id: string, config: UpdatePaymentMethodsDto) {
    return this.settingsService.updatePaymentMethods(id, config);
  }

  /**
   * @deprecated Usa RestaurantSettingsService.updateDeliveryZones() directamente
   */
  async updateDeliveryZones(id: string, config: UpdateDeliveryZonesDto) {
    return this.settingsService.updateDeliveryZones(id, config);
  }

  /**
   * @deprecated Usa RestaurantUsersService.getRoles() directamente
   */
  async getRoles(restaurantId: string) {
    return this.usersService.getRoles(restaurantId);
  }

  /**
   * @deprecated Usa RestaurantUsersService.getRestaurantUsers() directamente
   */
  async getRestaurantUsers(restaurantId: string) {
    return this.usersService.getRestaurantUsers(restaurantId);
  }

  /**
   * @deprecated Usa RestaurantUsersService.inviteUser() directamente
   */
  async inviteUser(
    restaurantId: string,
    inviteDto: {
      email: string;
      roleId?: string;
      roleName?: string;
      name?: string;
    },
  ) {
    return this.usersService.inviteUser(restaurantId, inviteDto);
  }

  /**
   * @deprecated Usa RestaurantUsersService.updateUserRole() directamente
   */
  async updateUserRole(
    restaurantId: string,
    userId: string,
    updateDto: { roleId?: string; isActive?: boolean },
  ) {
    return this.usersService.updateUserRole(restaurantId, userId, updateDto);
  }

  /**
   * @deprecated Usa RestaurantUsersService.removeUser() directamente
   */
  async removeUser(restaurantId: string, userId: string) {
    return this.usersService.removeUser(restaurantId, userId);
  }

  /**
   * Soft-delete a restaurant. Checks for active orders/reservations and
   * then marks the restaurant as INACTIVE, renames the slug to avoid
   * unique constraint collisions and deactivates/disassociates users.
   */
  async deleteRestaurant(id: string, performedByUserId: string) {
    const restaurant: any = await this.prisma.restaurant.findUnique({
      where: { id },
      include: { users: true },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${id} not found`);
    }

    // Check for active orders
    const activeOrder = await this.prisma.order.findFirst({
      where: {
        restaurantId: id,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
      },
      select: { id: true, status: true },
    });

    if (activeOrder) {
      throw new BadRequestException(
        'Cannot delete restaurant with active orders. Please complete or cancel them first.',
      );
    }

    // Check for active reservations
    const activeReservation = await this.prisma.reservation.findFirst({
      where: {
        restaurantId: id,
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] },
      },
      select: { id: true, status: true },
    });

    if (activeReservation) {
      throw new BadRequestException(
        'Cannot delete restaurant with active reservations. Please complete or cancel them first.',
      );
    }

    const newSlug = `${restaurant.slug}-deleted-${Date.now()}`;

    // Transaction: mark restaurant INACTIVE, rename slug
    // - Deactivate and disassociate other users
    // - Keep the performing user active but disassociate their restaurant and role
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          slug: newSlug,
        },
      });

      // Deactivate and disassociate all OTHER users
      await tx.user.updateMany({
        where: { restaurantId: id, id: { not: performedByUserId } },
        data: { isActive: false, restaurantId: null, roleId: null },
      });

      // For the performing user: keep account active, remove restaurant association and role
      await tx.user.update({
        where: { id: performedByUserId },
        data: { restaurantId: null, roleId: null },
      });
    });

    // Return minimal info so frontend can refresh session and redirect to onboarding
    return {
      message: 'Restaurant deleted (soft) successfully',
      id,
      redirect: '/onboarding',
    };
  }

  /**
   * @deprecated Usa RestaurantBrandingService.deleteAsset() directamente
   */
  async deleteAsset(id: string, type?: string) {
    return this.brandingService.deleteAsset(id, type);
  }

  /**
   * @deprecated Usa RestaurantBrandingService.presignAssetUpload() directamente
   */
  async presignAssetUpload(
    id: string,
    type: string,
    opts?: { contentType?: string; filename?: string },
  ) {
    return this.brandingService.presignAssetUpload(id, type, opts);
  }

  /**
   * @deprecated Usa RestaurantBrandingService.saveUploadedAsset() directamente
   */
  async saveUploadedAsset(id: string, file: Express.Multer.File, type: string) {
    return this.brandingService.saveUploadedAsset(id, file, type);
  }

  /**
   * Obtener lista de restaurantes públicos para sitemap
   */
  async getPublicRestaurants() {
    return this.prisma.restaurant.findMany({
      where: {
        status: RestaurantStatus.ACTIVE, // Solo restaurantes activos
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        cuisineTypes: true,
        city: true,
        country: true,
        logo: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }
}
