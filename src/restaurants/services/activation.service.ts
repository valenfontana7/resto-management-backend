import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RestaurantsService } from '../restaurants.service';
import {
  computeActivationScore,
  inferMilestonesFromSignals,
  mapProductIntentToModel,
  resolveNextMilestone,
  type ActivationMilestones,
  type ActivationPath,
  type ActivationScoreBand,
} from './activation-score';

export type { ActivationPath } from './activation-score';
export type FirstValueType = 'digital_publish' | 'salon_test_charge';

export type RecordFirstValueDto = {
  type: FirstValueType;
  path?: ActivationPath;
};

type OnboardingActivation = {
  activationPath?: ActivationPath;
  activationStartedAt?: string;
  firstValueAt?: string;
  firstValueType?: FirstValueType;
  milestones?: ActivationMilestones;
  score?: number;
  scoreBand?: ActivationScoreBand;
  scoreUpdatedAt?: string;
  secondSessionAt?: string;
  lastModuleVisited?: string;
  abandonedAt?: string;
};

type OnboardingRules = {
  productIntent?: string;
  activation?: OnboardingActivation;
};

const SEED_DISH_NAMES = new Set([
  'producto de prueba',
  'plato de prueba',
  'ejemplo',
]);

@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  getActivationState(businessRules: unknown, setupCreated = true) {
    const onboarding = this.readOnboarding(businessRules);
    const activation = onboarding.activation ?? {};
    const model = mapProductIntentToModel(onboarding.productIntent);
    const milestones = activation.milestones ?? {};
    const { score, band } = computeActivationScore(model, milestones);
    const nextMilestone = resolveNextMilestone(model, milestones);

    return {
      setupCreated,
      activationPath: activation.activationPath ?? null,
      activationStartedAt: activation.activationStartedAt ?? null,
      firstValueAt: activation.firstValueAt ?? null,
      firstValueType: activation.firstValueType ?? null,
      productIntent: onboarding.productIntent ?? null,
      hasFirstValue: Boolean(activation.firstValueAt),
      operationalModel: model,
      milestones,
      score: activation.score ?? score,
      scoreBand: activation.scoreBand ?? band,
      scoreUpdatedAt: activation.scoreUpdatedAt ?? null,
      secondSessionAt: activation.secondSessionAt ?? null,
      lastModuleVisited: activation.lastModuleVisited ?? null,
      nextMilestone,
    };
  }

  async getActivation(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        businessRules: true,
        onboardingIncomplete: true,
        isPublished: true,
        createdAt: true,
      },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const enriched = await this.recomputeAndPersist(restaurantId, restaurant);
    return {
      restaurantId: restaurant.id,
      onboardingIncomplete: restaurant.onboardingIncomplete,
      activation: enriched,
    };
  }

  async startActivation(
    restaurantId: string,
    input: { path: ActivationPath; productIntent?: string },
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const onboarding = this.readOnboarding(restaurant.businessRules);
    const existing = onboarding.activation ?? {};
    const startedAt = existing.activationStartedAt ?? new Date().toISOString();

    const nextRules = this.mergeOnboarding(restaurant.businessRules, {
      productIntent: input.productIntent ?? onboarding.productIntent,
      activation: {
        ...existing,
        activationPath: input.path,
        activationStartedAt: startedAt,
        abandonedAt: undefined,
      },
    });

    const updated = await this.restaurantsService.update(restaurantId, {
      businessRules: nextRules,
    });

    return {
      restaurant: updated,
      activation: this.getActivationState(nextRules, true),
    };
  }

  async recordFirstValue(restaurantId: string, dto: RecordFirstValueDto) {
    if (dto.type !== 'digital_publish' && dto.type !== 'salon_test_charge') {
      throw new BadRequestException('Invalid first value type');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true, isPublished: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const onboarding = this.readOnboarding(restaurant.businessRules);
    const existing = onboarding.activation ?? {};
    const now = new Date().toISOString();
    const path: ActivationPath =
      dto.path ?? (dto.type === 'salon_test_charge' ? 'salon' : 'digital');

    if (existing.firstValueAt) {
      const enriched = await this.recomputeAndPersist(restaurantId, {
        businessRules: restaurant.businessRules,
        isPublished: restaurant.isPublished,
      });
      return {
        restaurant: await this.restaurantsService.findById(restaurantId),
        activation: enriched,
        alreadyReached: true,
      };
    }

    const model = mapProductIntentToModel(onboarding.productIntent);
    const milestones = inferMilestonesFromSignals({
      firstValueType: dto.type,
      isPublished: restaurant.isPublished || dto.type === 'digital_publish',
      existing: existing.milestones,
    });
    const { score, band } = computeActivationScore(model, milestones);

    const nextRules = this.mergeOnboarding(restaurant.businessRules, {
      productIntent: onboarding.productIntent,
      activation: {
        ...existing,
        activationPath: existing.activationPath ?? path,
        activationStartedAt: existing.activationStartedAt ?? now,
        firstValueAt: now,
        firstValueType: dto.type,
        milestones,
        score,
        scoreBand: band,
        scoreUpdatedAt: now,
      },
    });

    const updated = await this.restaurantsService.update(restaurantId, {
      businessRules: nextRules,
      onboardingIncomplete: false,
    });

    return {
      restaurant: updated,
      activation: this.getActivationState(nextRules, true),
      alreadyReached: false,
    };
  }

  async recordModuleVisit(restaurantId: string, moduleId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const onboarding = this.readOnboarding(restaurant.businessRules);
    const existing = onboarding.activation ?? {};
    const nextRules = this.mergeOnboarding(restaurant.businessRules, {
      productIntent: onboarding.productIntent,
      activation: {
        ...existing,
        lastModuleVisited: moduleId,
      },
    });
    await this.restaurantsService.update(restaurantId, {
      businessRules: nextRules,
    });
    return { ok: true, moduleId };
  }

  async recordSecondSession(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true, isPublished: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const onboarding = this.readOnboarding(restaurant.businessRules);
    const existing = onboarding.activation ?? {};
    if (existing.secondSessionAt) {
      return this.getActivationState(restaurant.businessRules, true);
    }

    const now = new Date().toISOString();
    const milestones = inferMilestonesFromSignals({
      secondSessionAt: now,
      existing: existing.milestones,
      isPublished: restaurant.isPublished,
      firstValueType: existing.firstValueType,
    });
    const model = mapProductIntentToModel(onboarding.productIntent);
    const { score, band } = computeActivationScore(model, milestones);

    const nextRules = this.mergeOnboarding(restaurant.businessRules, {
      productIntent: onboarding.productIntent,
      activation: {
        ...existing,
        secondSessionAt: now,
        milestones,
        score,
        scoreBand: band,
        scoreUpdatedAt: now,
      },
    });
    await this.restaurantsService.update(restaurantId, {
      businessRules: nextRules,
    });
    return this.getActivationState(nextRules, true);
  }

  async markAbandoned(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    const onboarding = this.readOnboarding(restaurant.businessRules);
    const existing = onboarding.activation ?? {};
    if (existing.firstValueAt) return { ok: true, skipped: true };

    const nextRules = this.mergeOnboarding(restaurant.businessRules, {
      productIntent: onboarding.productIntent,
      activation: {
        ...existing,
        abandonedAt: new Date().toISOString(),
      },
    });
    await this.restaurantsService.update(restaurantId, {
      businessRules: nextRules,
    });
    return { ok: true };
  }

  private async recomputeAndPersist(
    restaurantId: string,
    restaurant: {
      businessRules: unknown;
      isPublished?: boolean | null;
    },
  ) {
    const onboarding = this.readOnboarding(restaurant.businessRules);
    const existing = onboarding.activation ?? {};
    const model = mapProductIntentToModel(onboarding.productIntent);

    const [dishes, memberships, realOrders] = await Promise.all([
      this.prisma.dish.findMany({
        where: { restaurantId, deletedAt: null },
        select: { name: true },
        take: 50,
      }),
      this.prisma.restaurantMembership.count({ where: { restaurantId } }),
      this.prisma.order.count({
        where: {
          restaurantId,
          paymentStatus: 'PAID',
          AND: [
            {
              OR: [
                { notes: null },
                { NOT: { notes: { contains: 'Activación WOW' } } },
              ],
            },
            {
              NOT: { customerName: { equals: 'Prueba Bentoo' } },
            },
          ],
        },
      }),
    ]);

    const realDishCount = dishes.filter(
      (d) => !SEED_DISH_NAMES.has((d.name || '').trim().toLowerCase()),
    ).length;

    const milestones = inferMilestonesFromSignals({
      firstValueType: existing.firstValueType,
      isPublished: Boolean(restaurant.isPublished),
      realDishCount,
      realOpsCount: realOrders,
      teamMemberCount: memberships,
      secondSessionAt: existing.secondSessionAt,
      existing: existing.milestones,
    });

    const { score, band } = computeActivationScore(model, milestones);
    const prevScore = existing.score;
    const prevBand = existing.scoreBand;
    const milestonesUnchanged =
      JSON.stringify(existing.milestones ?? {}) === JSON.stringify(milestones);

    if (milestonesUnchanged && prevScore === score && prevBand === band) {
      return this.getActivationState(restaurant.businessRules, true);
    }

    const now = new Date().toISOString();
    const nextRules = this.mergeOnboarding(restaurant.businessRules, {
      productIntent: onboarding.productIntent,
      activation: {
        ...existing,
        milestones,
        score,
        scoreBand: band,
        scoreUpdatedAt: now,
      },
    });

    await this.restaurantsService.update(restaurantId, {
      businessRules: nextRules,
    });

    return this.getActivationState(nextRules, true);
  }

  private readOnboarding(businessRules: unknown): OnboardingRules {
    const rules =
      businessRules && typeof businessRules === 'object'
        ? (businessRules as Record<string, unknown>)
        : {};
    const onboarding =
      rules.onboarding && typeof rules.onboarding === 'object'
        ? (rules.onboarding as OnboardingRules)
        : {};
    return onboarding;
  }

  private mergeOnboarding(
    businessRules: unknown,
    nextOnboarding: OnboardingRules,
  ): Record<string, unknown> {
    const current =
      businessRules && typeof businessRules === 'object'
        ? { ...(businessRules as Record<string, unknown>) }
        : {};
    const currentOnboarding = this.readOnboarding(businessRules);
    return {
      ...current,
      onboarding: {
        ...currentOnboarding,
        ...nextOnboarding,
        activation: {
          ...(currentOnboarding.activation ?? {}),
          ...(nextOnboarding.activation ?? {}),
          milestones: {
            ...(currentOnboarding.activation?.milestones ?? {}),
            ...(nextOnboarding.activation?.milestones ?? {}),
          },
        },
      },
    };
  }
}
