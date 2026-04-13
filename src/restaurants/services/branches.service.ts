import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async listBranches(restaurantId: string) {
    return this.prisma.restaurant.findMany({
      where: { parentId: restaurantId },
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
        city: true,
        phone: true,
        status: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createBranch(
    parentId: string,
    data: {
      name: string;
      slug: string;
      address: string;
      city: string;
      phone: string;
      email: string;
    },
  ) {
    const parent = await this.prisma.restaurant.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        parentId: true,
        type: true,
        cuisineTypes: true,
        country: true,
        branding: true,
        features: true,
        businessRules: true,
      },
    });

    if (!parent) throw new NotFoundException('Restaurant not found');
    if (parent.parentId)
      throw new ForbiddenException('A branch cannot have sub-branches');

    return this.prisma.restaurant.create({
      data: {
        parentId,
        name: data.name,
        slug: data.slug,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        country: parent.country,
        type: parent.type,
        cuisineTypes: parent.cuisineTypes,
        branding: parent.branding ?? undefined,
        features: parent.features ?? undefined,
        businessRules: parent.businessRules ?? undefined,
        onboardingIncomplete: false,
      },
    });
  }

  async deleteBranch(parentId: string, branchId: string) {
    const branch = await this.prisma.restaurant.findUnique({
      where: { id: branchId },
      select: { parentId: true },
    });

    if (!branch || branch.parentId !== parentId) {
      throw new NotFoundException('Branch not found');
    }

    await this.prisma.restaurant.delete({ where: { id: branchId } });
    return { deleted: true };
  }

  /** Get the parent restaurant and its branch count */
  async getParentInfo(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        parentId: true,
        _count: { select: { branches: true } },
      },
    });

    if (!restaurant) throw new NotFoundException('Restaurant not found');

    return {
      isMainBranch: !restaurant.parentId,
      parentId: restaurant.parentId,
      branchCount: restaurant._count.branches,
    };
  }
}
