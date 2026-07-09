import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  getOperationStations,
  mergeOperationStations,
  normalizeStationsInput,
  type OperationStation,
} from '../utils/operation-stations';

@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async list(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    return {
      stations: getOperationStations(restaurant?.businessRules),
      isDefault: !this.hasCustomStations(restaurant?.businessRules),
    };
  }

  async replace(
    restaurantId: string,
    userId: string,
    input: Array<{
      id: string;
      name: string;
      kind: string;
      active?: boolean;
    }>,
  ) {
    await this.ownership.verifyUserRole(restaurantId, userId, [
      'OWNER',
      'MANAGER',
      'ADMIN',
      'SUPER_ADMIN',
    ]);

    const stations = normalizeStationsInput(input);
    if (stations.length === 0) {
      throw new BadRequestException(
        'Debés enviar al menos una estación válida',
      );
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    const merged = mergeOperationStations(restaurant?.businessRules, stations);

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { businessRules: merged as object },
    });

    return { stations };
  }

  private hasCustomStations(businessRules: unknown): boolean {
    const rules =
      businessRules && typeof businessRules === 'object'
        ? (businessRules as Record<string, unknown>)
        : null;
    const ops =
      rules?.operations && typeof rules.operations === 'object'
        ? (rules.operations as Record<string, unknown>)
        : null;
    return (
      Array.isArray(ops?.stations) && (ops.stations as unknown[]).length > 0
    );
  }
}

export type { OperationStation };
