import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bootstrap Organization → Location para restaurantes standalone (1 locación).
 */
@Injectable()
export class OrganizationBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureOrganizationForRestaurant(restaurantId: string): Promise<string> {
    const existing = await this.prisma.location.findUnique({
      where: { restaurantId },
      select: { organizationId: true },
    });
    if (existing) return existing.organizationId;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true },
    });
    if (!restaurant) {
      throw new Error(`Restaurant ${restaurantId} not found`);
    }

    const org = await this.prisma.organization.create({
      data: {
        name: restaurant.name,
        slug: `org-${restaurant.slug}`,
        locations: {
          create: {
            restaurantId: restaurant.id,
            name: restaurant.name,
          },
        },
      },
      select: { id: true },
    });

    return org.id;
  }
}
