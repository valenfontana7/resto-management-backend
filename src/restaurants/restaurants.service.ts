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

@Injectable()
export class RestaurantsService {
  constructor(private prisma: PrismaService) {}

  async findBySlug(slug: string) {
    return this.prisma.restaurant.findUnique({
      where: { slug },
      include: {
        hours: true,
      },
    });
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

    return restaurant;
  }

  async create(payload: any) {
    const data = payload.config || payload;

    if (!data.businessInfo?.name) {
      throw new Error('Restaurant name is required');
    }

    const { businessInfo, contact, branding, businessRules, features, hours } =
      data;

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

    if (hours) {
      for (const [day, schedule] of Object.entries(hours)) {
        if (daysMap[day] !== undefined) {
          hoursData.push({
            dayOfWeek: daysMap[day],
            openTime: (schedule as any).openTime,
            closeTime: (schedule as any).closeTime,
            isOpen: (schedule as any).isOpen,
          });
        }
      }
    }

    const slug = data.slug || this.generateSlug(businessInfo.name);

    const existingRestaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
    });

    if (existingRestaurant) {
      throw new ConflictException(
        `Restaurant with slug "${slug}" already exists`,
      );
    }

    return this.prisma.restaurant.create({
      data: {
        slug,
        name: businessInfo.name,
        type: businessInfo.type,
        cuisineTypes: businessInfo.cuisineTypes,
        description: businessInfo.description,

        email: contact.email,
        phone: contact.phone,
        address: contact.address,
        city: contact.city,
        country: contact.country,
        postalCode: contact.postalCode,

        branding: {
          colors: branding.colors,
          layout: branding.layout,
          typography: {
            fontFamily: 'Inter',
            fontSize: 'md',
          },
        },

        features: features,

        socialMedia: {},

        minOrderAmount: businessRules.orders.minOrderAmount,
        orderLeadTime: businessRules.orders.orderLeadTime,

        hours: {
          create: hoursData,
        },
      },
    });
  }

  async associateUserWithRestaurant(userId: string, restaurantId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { restaurantId },
    });
  }

  async update(id: string, payload: any) {
    const updateData: any = {};

    // Handle new JSON fields - ensure they are properly serialized
    if (payload.branding !== undefined) {
      // If branding is a string, parse it; otherwise use as-is
      updateData.branding = typeof payload.branding === 'string' 
        ? JSON.parse(payload.branding) 
        : payload.branding;
    }

    if (payload.features !== undefined) {
      updateData.features = typeof payload.features === 'string'
        ? JSON.parse(payload.features)
        : payload.features;
    }

    if (payload.socialMedia !== undefined) {
      updateData.socialMedia = typeof payload.socialMedia === 'string'
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

    console.log('📝 Updating restaurant with data:', JSON.stringify(updateData, null, 2));

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
      brandingKeys: updated.branding ? Object.keys(updated.branding as object) : [],
      branding: updated.branding,
    });

    return updated;
  }

  async updateHours(id: string, hours: any[]) {
    // Transaction: Delete old hours, insert new ones
    return this.prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({
        where: { restaurantId: id },
      });

      // Only create records for days that are open
      const openHours = hours.filter((h) => h.isOpen === true);

      if (openHours && openHours.length > 0) {
        await tx.businessHour.createMany({
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
      const savedHours = await tx.businessHour.findMany({
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
          deliveryFee: zone.deliveryFee,
          minOrder: zone.minOrder,
          estimatedTime: zone.estimatedTime || '30-45 min',
          areas: zone.areas,
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
    const existingUser = await this.prisma.user.findUnique({
      where: {
        restaurantId_email: {
          restaurantId,
          email: inviteDto.email,
        },
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists in this restaurant');
    }

    // Create new user with temporary password
    const hashedPassword = await bcrypt.hash('TempPassword123!', 10);

    return this.prisma.user.create({
      data: {
        email: inviteDto.email,
        name: inviteDto.name || inviteDto.email.split('@')[0],
        password: hashedPassword,
        restaurantId,
        roleId: role.id,
        isActive: true,
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
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    // Don't allow removing Admin users
    if (user.role.name === 'Admin') {
      throw new ConflictException('Cannot remove an Admin user');
    }

    // Soft delete: set isActive to false and deletedAt timestamp
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return { success: true, message: 'User removed successfully' };
  }
}
