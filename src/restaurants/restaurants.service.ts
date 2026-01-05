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
      include: {
        hours: true,
      },
    });

    return this.mapRestaurantForClient(restaurant);
  }

  async findById(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        hours: true,
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
      const branding: any = { ...(mapped.branding as any) };
      if ('logo' in branding) branding.logo = this.s3.toClientUrl(branding.logo);
      if ('bannerImage' in branding)
        branding.bannerImage = this.s3.toClientUrl(branding.bannerImage);
      if ('coverImage' in branding)
        branding.coverImage = this.s3.toClientUrl(branding.coverImage);
      mapped.branding = branding;
    }

    return mapped;
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
    const slug = contact.customSlug || data.slug || this.generateSlug(restaurantName);

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

          hours: hoursData.length > 0 ? {
            create: hoursData,
          } : undefined,
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
      const newBranding =
        typeof payload.branding === 'string'
          ? JSON.parse(payload.branding)
          : payload.branding;

      const currentBranding = (currentRestaurant.branding as any) || {};

      // Deep merge branding preserving existing fields
      updateData.branding = {
        ...currentBranding,
        ...newBranding,
        colors: {
          ...currentBranding.colors,
          ...newBranding.colors,
        },
        layout: {
          ...currentBranding.layout,
          ...newBranding.layout,
        },
        typography: {
          ...currentBranding.typography,
          ...newBranding.typography,
        },
        hero: {
          ...currentBranding.hero,
          ...newBranding.hero,
        },
        visual: {
          ...currentBranding.visual,
          ...newBranding.visual,
        },
        sections: {
          hero: {
            ...currentBranding.sections?.hero,
            ...newBranding.sections?.hero,
          },
          menu: {
            ...currentBranding.sections?.menu,
            ...newBranding.sections?.menu,
          },
          footer: {
            ...currentBranding.sections?.footer,
            ...newBranding.sections?.footer,
          },
        },
      };
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

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: updateData as any,
      include: {
        hours: true,
      },
    });

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
  async updatePaymentMethods(id: string, config: UpdatePaymentMethodsDto) {
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
        } as any,
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
    const key = path.posix.join('restaurants', id, assetType, `${unique}${ext}`);

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
    const key = path.posix.join('restaurants', id, normalized, `${unique}${ext}`);

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
        if (branding.logo !== undefined) await this.s3.deleteObjectByUrl(branding.logo);
        branding.logo = uploaded.key;
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
}
