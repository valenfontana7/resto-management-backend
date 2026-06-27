import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  canUserCollectOnFloor,
  SALON_COLLECT_DENIED_MESSAGE,
} from '../../common/utils/salon-staff-separation.util';

@Injectable()
export class FloorAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async verifyCollectAccess(
    restaurantId: string,
    userId: string,
  ): Promise<void> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const [user, restaurant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: { select: { name: true, permissions: true } } },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { businessRules: true },
      }),
    ]);

    if (!user) {
      throw new ForbiddenException('Usuario no encontrado');
    }

    const allowed = canUserCollectOnFloor(
      user.role?.name,
      user.role?.permissions,
      restaurant?.businessRules,
    );

    if (!allowed) {
      throw new ForbiddenException(SALON_COLLECT_DENIED_MESSAGE);
    }
  }
}
