import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  getOperationEscalation,
  mergeOperationEscalation,
  normalizeEscalationInput,
  type OperationEscalationConfig,
} from '../utils/operation-escalation';

@Injectable()
export class EscalationConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async get(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    return {
      escalation: getOperationEscalation(restaurant?.businessRules),
      isDefault: !this.hasCustomEscalation(restaurant?.businessRules),
    };
  }

  async replace(
    restaurantId: string,
    userId: string,
    input: {
      ackDeadlineMinutesByPriority?: Partial<
        Record<'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW', number>
      >;
      escalateCriticalImmediately?: boolean;
    },
  ) {
    await this.ownership.verifyUserRole(restaurantId, userId, [
      'OWNER',
      'MANAGER',
      'ADMIN',
      'SUPER_ADMIN',
    ]);

    const escalation = normalizeEscalationInput(input);
    this.assertValidConfig(escalation);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });

    const merged = mergeOperationEscalation(
      restaurant?.businessRules,
      escalation,
    );

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { businessRules: merged as object },
    });

    return { escalation };
  }

  private assertValidConfig(config: OperationEscalationConfig): void {
    const values = Object.values(config.ackDeadlineMinutesByPriority);
    if (values.some((v) => v < 1 || v > 120)) {
      throw new BadRequestException(
        'Los plazos de ack deben estar entre 1 y 120 minutos',
      );
    }
  }

  private hasCustomEscalation(businessRules: unknown): boolean {
    const rules =
      businessRules && typeof businessRules === 'object'
        ? (businessRules as Record<string, unknown>)
        : null;
    const operations =
      rules?.operations && typeof rules.operations === 'object'
        ? (rules.operations as Record<string, unknown>)
        : null;
    return (
      operations?.escalation != null &&
      typeof operations.escalation === 'object'
    );
  }
}
