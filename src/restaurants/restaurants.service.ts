import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

        primaryColor: branding.colors.primary,
        secondaryColor: branding.colors.secondary,
        accentColor: branding.colors.accent,
        backgroundColor: branding.colors.background,

        menuStyle: branding.layout.menuStyle,
        showHeroSection: branding.layout.showHeroSection,
        categoryDisplay: branding.layout.categoryDisplay,

        minOrderAmount: businessRules.orders.minOrderAmount,
        orderLeadTime: businessRules.orders.orderLeadTime,

        deliveryEnabled: features.delivery,
        reservationsEnabled: features.reservations,
        loyaltyEnabled: features.loyalty,

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
    const data = payload.config || payload;
    const { businessInfo, contact, branding, businessRules, features } = data;

    const updateData: any = {};

    if (businessInfo) {
      if (businessInfo.name) updateData.name = businessInfo.name;
      if (businessInfo.type) updateData.type = businessInfo.type;
      if (businessInfo.cuisineTypes)
        updateData.cuisineTypes = businessInfo.cuisineTypes;
      if (businessInfo.description)
        updateData.description = businessInfo.description;
    }

    if (contact) {
      if (contact.email) updateData.email = contact.email;
      if (contact.phone) updateData.phone = contact.phone;
      if (contact.address) updateData.address = contact.address;
      if (contact.city) updateData.city = contact.city;
      if (contact.country) updateData.country = contact.country;
      if (contact.postalCode) updateData.postalCode = contact.postalCode;
    }

    if (branding) {
      if (branding.colors) {
        if (branding.colors.primary)
          updateData.primaryColor = branding.colors.primary;
        if (branding.colors.secondary)
          updateData.secondaryColor = branding.colors.secondary;
        if (branding.colors.accent)
          updateData.accentColor = branding.colors.accent;
        if (branding.colors.background)
          updateData.backgroundColor = branding.colors.background;
      }
      if (branding.layout) {
        if (branding.layout.menuStyle)
          updateData.menuStyle = branding.layout.menuStyle;
        if (branding.layout.showHeroSection !== undefined)
          updateData.showHeroSection = branding.layout.showHeroSection;
        if (branding.layout.categoryDisplay)
          updateData.categoryDisplay = branding.layout.categoryDisplay;
      }
    }

    if (businessRules && businessRules.orders) {
      if (businessRules.orders.minOrderAmount)
        updateData.minOrderAmount = businessRules.orders.minOrderAmount;
      if (businessRules.orders.orderLeadTime)
        updateData.orderLeadTime = businessRules.orders.orderLeadTime;
    }

    if (features) {
      if (features.delivery !== undefined)
        updateData.deliveryEnabled = features.delivery;
      if (features.reservations !== undefined)
        updateData.reservationsEnabled = features.reservations;
      if (features.loyalty !== undefined)
        updateData.loyaltyEnabled = features.loyalty;
    }

    try {
      return await this.prisma.restaurant.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Restaurant with ID ${id} not found`);
      }
      throw error;
    }
  }

  async updateHours(id: string, hours: any[]) {
    // Transaction: Delete old hours, insert new ones
    return this.prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({
        where: { restaurantId: id },
      });

      if (hours && hours.length > 0) {
        await tx.businessHour.createMany({
          data: hours.map((h) => ({
            restaurantId: id,
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime,
            closeTime: h.closeTime,
            isOpen: h.isOpen,
          })),
        });
      }

      return tx.businessHour.findMany({
        where: { restaurantId: id },
      });
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
}
