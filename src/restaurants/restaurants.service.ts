import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateBrandingDto,
  UpdatePaymentMethodsDto,
  UpdateDeliveryZonesDto,
} from './dto/restaurant-settings.dto';
import * as path from 'path';
import { S3Service } from '../storage/s3.service';

@Injectable()
export class RestaurantsService {
  constructor(
    private prisma: PrismaService,
    private readonly s3: S3Service,
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

  async logVisit(
    restaurantId: string,
    meta?: {
      ip?: string | null;
      userAgent?: string | null;
      referrer?: string | null;
    },
  ) {
    try {
      await this.prisma.analytics.create({
        data: {
          restaurantId,
          metric: 'page_view',
          value: 1,
          metadata: meta || {},
        },
      });
    } catch (e) {
      console.warn('Failed to log analytics:', e?.message || e);
    }
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
        primary: '#4f46e5',
        secondary: '#9333ea',
        accent: '#ec4899',
        text: '#1f2937',
        background: '#ffffff',
      },
      layout: {
        menuStyle: 'grid',
        categoryDisplay: 'tabs',
        showHeroSection: true,
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
              primary: '#4f46e5',
              secondary: '#9333ea',
              accent: '#ec4899',
              text: '#1f2937',
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

    // Handle legacy fields for backwards compatibility
    const { businessInfo, contact, taxId } = payload;

    if (businessInfo) {
      if (businessInfo.name) updateData.name = businessInfo.name;
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

  async updateHours(id: string, hours: any[]) {
    // Transaction: Delete old hours, insert new ones
    return this.prisma.$transaction(async () => {
      await this.prisma.businessHour.deleteMany({
        where: { restaurantId: id },
      });

      // Only create records for days that are open
      const openHours = hours.filter((h) => h.isOpen === true);

      if (openHours && openHours.length > 0) {
        await this.prisma.businessHour.createMany({
          data: openHours.map((h) => ({
            restaurantId: id,
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime,
            closeTime: h.closeTime,
            isOpen: true,
          })),
        });
      }

      // Return all days (0-6) with proper structure
      const savedHours = await this.prisma.businessHour.findMany({
        where: { restaurantId: id },
      });

      // Create a complete week structure (0-6)
      const allDays = Array.from({ length: 7 }, (_, dayOfWeek) => {
        const existingHour = savedHours.find((h) => h.dayOfWeek === dayOfWeek);
        if (existingHour) {
          return existingHour;
        }
        // Return closed day structure for days without records
        return {
          dayOfWeek,
          isOpen: false,
          openTime: null,
          closeTime: null,
        };
      });

      return allDays;
    });
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
      out.textShadow = this.coerceBooleanField(
        hero.textShadow,
        'branding.hero.textShadow',
      );
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
        out[f] = this.coerceBooleanField(layout[f], `branding.layout.${f}`);
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
  // LEGACY METHOD - Use update() instead with branding JSON field
  /**
   * Update restaurant branding settings
   * @deprecated Use update() method with branding JSON field
   */
  async updateBranding(id: string, branding: UpdateBrandingDto) {
    // Convert to new format
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
   * Update payment methods configuration
   */
  async updatePaymentMethods(id: string, _config: UpdatePaymentMethodsDto) {
    // Store as JSON in a dedicated field (requires migration)
    // For now, we'll use a simple approach with Restaurant fields
    const updateData: any = {};

    // We need to add paymentMethods field to Restaurant schema
    // This is a placeholder - requires migration
    return this.prisma.restaurant.update({
      where: { id },
      data: updateData,
      select: {
        updatedAt: true,
      },
    });
  }

  /**
   * Update delivery zones configuration
   */
  async updateDeliveryZones(id: string, config: UpdateDeliveryZonesDto) {
    const { deliveryZones, enableDelivery } = config;

    // Update restaurant delivery settings in features (JSON field)
    const restaurant: any = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    const currentFeatures = restaurant?.features || {};

    await this.prisma.restaurant.update({
      where: { id },
      data: {
        features: {
          ...currentFeatures,
          delivery: enableDelivery,
        },
      },
    });

    // Update or create delivery zones
    if (deliveryZones && deliveryZones.length > 0) {
      // Delete existing zones
      await this.prisma.deliveryZone.deleteMany({
        where: { restaurantId: id },
      });

      // Create new zones
      await this.prisma.deliveryZone.createMany({
        data: deliveryZones.map((zone) => ({
          restaurantId: id,
          name: zone.name,
          deliveryFee: zone.deliveryFee || 0,
          minOrder: zone.minOrder || 0,
          estimatedTime: zone.estimatedTime || '',
          areas: zone.areas || [],
        })),
      });
    }

    return this.prisma.deliveryZone.findMany({
      where: { restaurantId: id },
    });
  }

  /**
   * Get roles with permissions for a restaurant
   */
  async getRoles(restaurantId: string) {
    return this.prisma.role.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        permissions: true,
        color: true,
        isSystemRole: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get all users from a restaurant
   */
  async getRestaurantUsers(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        email: true,
        name: true,
        lastLogin: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Invite a user to a restaurant
   * TODO: Implement invitation system with email and expiration
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
    let role;
    const roleIdentifier = inviteDto.roleId || inviteDto.roleName;

    if (!roleIdentifier) {
      throw new BadRequestException('Either roleId or role name is required');
    }

    // Try to find role by ID first
    role = await this.prisma.role.findUnique({
      where: { id: roleIdentifier },
    });

    // If not found by ID, try by name (case-insensitive)
    if (!role) {
      // Try exact match first
      role = await this.prisma.role.findFirst({
        where: {
          restaurantId,
          name: {
            equals: roleIdentifier,
            mode: 'insensitive',
          },
        },
      });

      // If still not found, try capitalized version (Manager, Waiter, etc.)
      if (!role && roleIdentifier.length > 0) {
        const capitalizedName =
          roleIdentifier.charAt(0).toUpperCase() +
          roleIdentifier.slice(1).toLowerCase();
        role = await this.prisma.role.findFirst({
          where: {
            restaurantId,
            name: capitalizedName,
          },
        });
      }
    }

    if (!role) {
      throw new NotFoundException(
        `Role '${roleIdentifier}' not found in this restaurant`,
      );
    }

    // Verify role belongs to this restaurant
    if (role.restaurantId !== restaurantId) {
      throw new BadRequestException('Invalid role for this restaurant');
    }

    // Check if user already exists with this email in this restaurant
    const existingUser = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        email: inviteDto.email,
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists in this restaurant');
    }

    // Create new user with temporary password
    const hashedPassword = await bcrypt.hash('TempPassword123!', 10);

    return this.prisma.user.create({
      data: {
        name: inviteDto.email.split('@')[0], // Use email prefix as default name
        email: inviteDto.email,
        password: hashedPassword,
        restaurantId,
        roleId: role.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Update user role and status
   */
  async updateUserRole(
    restaurantId: string,
    userId: string,
    updateDto: { roleId?: string; isActive?: boolean },
  ) {
    // Verify user belongs to this restaurant
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    // If updating role, verify it belongs to this restaurant
    if (updateDto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: updateDto.roleId },
      });

      if (!role || role.restaurantId !== restaurantId) {
        throw new BadRequestException('Invalid role for this restaurant');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        roleId: updateDto.roleId,
        isActive: updateDto.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Remove user from restaurant
   */
  async removeUser(restaurantId: string, userId: string) {
    // Verify user belongs to this restaurant
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    // Soft delete: set isActive to false
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
      },
    });

    return { success: true, message: 'User removed successfully' };
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
   * Delete a restaurant asset by type (e.g., 'banner', 'logo')
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

      // If branding JSON stores banner/cover, clear it as well
      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.bannerImage !== undefined)
          await this.s3.deleteObjectByUrl(branding.bannerImage);
        if (branding.coverImage !== undefined)
          await this.s3.deleteObjectByUrl(branding.coverImage);
        if (branding.bannerImage !== undefined) branding.bannerImage = null;
        if (branding.coverImage !== undefined) branding.coverImage = null;
        updateData.branding = branding;
      }
    } else if (normalized === 'logo') {
      await this.s3.deleteObjectByUrl(restaurant.logo);
      updateData.logo = null;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.logo !== undefined)
          await this.s3.deleteObjectByUrl(branding.logo);
        if (branding.logo !== undefined) branding.logo = null;
        updateData.branding = branding;
      }
    } else if (normalized === 'favicon') {
      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.favicon !== undefined)
          await this.s3.deleteObjectByUrl(branding.favicon);
        if (branding.favicon !== undefined) branding.favicon = null;
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

  async presignAssetUpload(
    id: string,
    type: string,
    opts?: { contentType?: string; filename?: string },
  ) {
    const restaurant: any = await this.prisma.restaurant.findUnique({
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
      const ct = opts.contentType.toLowerCase();
      if (ct === 'image/jpeg' || ct === 'image/jpg') ext = '.jpg';
      else if (ct === 'image/png') ext = '.png';
      else if (ct === 'image/webp') ext = '.webp';
      else if (ct === 'image/gif') ext = '.gif';
      else if (ct === 'image/svg+xml') ext = '.svg';
      else ext = '.jpg';
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
   * Save uploaded asset file to S3 and update restaurant record
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
        if (branding.bannerImage !== undefined)
          await this.s3.deleteObjectByUrl(branding.bannerImage);
        if (branding.coverImage !== undefined)
          await this.s3.deleteObjectByUrl(branding.coverImage);
        branding.bannerImage = uploaded.key;
        branding.coverImage = uploaded.key;
        updateData.branding = branding;
      }
    } else if (normalized === 'logo') {
      await this.s3.deleteObjectByUrl(restaurant.logo);
      updateData.logo = uploaded.key;

      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.logo !== undefined)
          await this.s3.deleteObjectByUrl(branding.logo);
        branding.logo = uploaded.key;
        updateData.branding = branding;
      }
    } else if (normalized === 'favicon') {
      if (restaurant.branding && typeof restaurant.branding === 'object') {
        const branding = { ...(restaurant.branding as object) } as any;
        if (branding.favicon !== undefined)
          await this.s3.deleteObjectByUrl(branding.favicon);
        branding.favicon = uploaded.key;
        updateData.branding = branding;
      } else {
        // Create branding object if it doesn't exist
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
}
