import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRestaurantFeatures } from '../common/utils/restaurant-features.util';
import { adjustFeaturesForPlan } from '../subscriptions/constants';
import { PlanType } from '../subscriptions/dto';
import { PlanEntitlementsService } from '../subscriptions/plans/plan-entitlements.service';
import { SubscriptionResolverService } from '../subscriptions/subscription-resolver.service';
import { isSubscriptionBillingActive } from '../subscriptions/subscription-billing-access';
import { GoLiveReadinessService } from '../restaurants/services/go-live-readiness.service';
import type { GoLiveReadinessResponse } from '../restaurants/services/go-live-readiness.service';
import type { OperationalProfileRecord } from '../operational-profile/operational-profile.types';
import { buildExperienceDefinition } from './experience-builder';
import type {
  ExperienceBuilderInput,
  ExperienceResponse,
  OperationalExperienceProfileId,
} from './experience.types';
import { listExperiencePresetSummaries } from './presets';
import { PatchExperienceProfileDto } from './dto/experience.dto';

@Injectable()
export class ExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planEntitlements: PlanEntitlementsService,
    private readonly subscriptionResolver: SubscriptionResolverService,
    private readonly goLiveReadiness: GoLiveReadinessService,
  ) {}

  listPresets() {
    return { presets: listExperiencePresetSummaries() };
  }

  async getExperience(
    restaurantId: string,
    userId: string,
    role: string,
    options?: { demoMode?: boolean },
  ): Promise<ExperienceResponse> {
    const input = await this.buildInput(
      restaurantId,
      userId,
      role,
      options?.demoMode ?? false,
    );
    const definition = buildExperienceDefinition(input);

    return {
      definition,
      generatedAt: new Date().toISOString(),
      restaurantId,
    };
  }

  async patchExperienceProfile(
    restaurantId: string,
    dto: PatchExperienceProfileDto,
    userId: string,
  ): Promise<ExperienceResponse> {
    const profileRow =
      await this.prisma.restaurantOperationalProfile.findUnique({
        where: { restaurantId },
      });

    if (!profileRow) {
      throw new NotFoundException('No encontramos el perfil operativo');
    }

    await this.prisma.restaurantOperationalProfile.update({
      where: { restaurantId },
      data: {
        experienceProfileId: dto.clearOverride ? null : dto.profileId,
        experienceProfileOverrideByUserId: dto.clearOverride ? null : userId,
        experienceProfileInferredAt: new Date(),
      },
    });

    return this.getExperience(restaurantId, userId, 'OWNER');
  }

  private async buildInput(
    restaurantId: string,
    userId: string,
    role: string,
    demoMode: boolean,
  ): Promise<ExperienceBuilderInput> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        operationalProfile: true,
        _count: {
          select: {
            orders: true,
            branches: true,
          },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const planId =
      (await this.subscriptionResolver.resolvePlanIdForRestaurant(
        restaurantId,
      )) ?? 'STARTER';
    const subscription =
      await this.subscriptionResolver.resolveForRestaurant(restaurantId);
    const entitlements = await this.planEntitlements.getSnapshot(planId);

    const rawFeatures = normalizeRestaurantFeatures(restaurant.features);
    const adjustedFeatures = adjustFeaturesForPlan(
      rawFeatures,
      planId as PlanType,
    );

    const readiness = await this.goLiveReadiness.getReadiness(
      restaurantId,
      userId,
    );

    const { progress, isReady } = computeGoLiveSnapshot(
      readiness,
      restaurant.isPublished,
    );

    const businessRules = restaurant.businessRules as Record<
      string,
      unknown
    > | null;
    const productIntent = (
      businessRules?.onboarding as { productIntent?: string } | undefined
    )?.productIntent;

    const isFranchise = Boolean(
      (businessRules as { franchise?: { enabled?: boolean } } | null)?.franchise
        ?.enabled,
    );

    const operationalProfile = restaurant.operationalProfile
      ? this.mapOperationalProfile(restaurant.operationalProfile)
      : null;

    const accountAgeDays = Math.max(
      0,
      (Date.now() - restaurant.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    );

    const operatorMaturity =
      restaurant._count.orders >= 10 || accountAgeDays >= 14
        ? 'veteran'
        : 'new';

    const overrideId = restaurant.operationalProfile?.experienceProfileId as
      | OperationalExperienceProfileId
      | null
      | undefined;

    return {
      restaurantId,
      capabilities: {
        features: adjustedFeatures as Record<string, boolean>,
        businessRules,
      },
      operationalProfile,
      enabledModules: {
        features: adjustedFeatures as Record<string, boolean>,
      },
      subscriptionPlan: {
        planId,
        planType: subscription?.planType ?? 'STARTER',
        isActive: subscription
          ? isSubscriptionBillingActive(subscription)
          : false,
        features: entitlements.features,
        limits: entitlements.limits,
      },
      tenantConfig: {
        productIntent: productIntent ?? null,
        isPublished: restaurant.isPublished ?? false,
        branchCount: restaurant._count.branches,
        isFranchise,
        onboardingIncomplete: restaurant.onboardingIncomplete ?? true,
      },
      runtimeContext: {
        role: role ?? 'OWNER',
        operatorMaturity,
        goLiveProgress: progress,
        goLiveIsReady: isReady,
        demoMode,
        ordersCount: restaurant._count.orders,
        accountAgeDays,
      },
      experienceProfileOverride: overrideId ?? null,
    };
  }

  private mapOperationalProfile(row: {
    id: string;
    restaurantId: string;
    schemaVersion: number;
    operationalModel: string;
    maturityLevel: string;
    focusAreas: unknown;
    businessPriorities: unknown;
    capabilitySnapshot: unknown;
    profileStatus: string;
    completedWizardVersion: number | null;
    completedStepIds: unknown;
    completedAt: Date | null;
    completedByUserId: string | null;
    migratedFromLegacy: boolean;
    migrationSource: string | null;
    dismissedHints: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): OperationalProfileRecord {
    return {
      id: row.id,
      restaurantId: row.restaurantId,
      schemaVersion: row.schemaVersion,
      operationalModel:
        row.operationalModel as OperationalProfileRecord['operationalModel'],
      maturityLevel:
        row.maturityLevel as OperationalProfileRecord['maturityLevel'],
      focusAreas: Array.isArray(row.focusAreas)
        ? (row.focusAreas as OperationalProfileRecord['focusAreas'])
        : [],
      businessPriorities:
        (row.businessPriorities as OperationalProfileRecord['businessPriorities']) ?? {
          primary: 'reliability',
        },
      capabilitySnapshot:
        row.capabilitySnapshot as OperationalProfileRecord['capabilitySnapshot'],
      profileStatus:
        row.profileStatus as OperationalProfileRecord['profileStatus'],
      completedWizardVersion: row.completedWizardVersion,
      completedStepIds: Array.isArray(row.completedStepIds)
        ? (row.completedStepIds as string[])
        : [],
      completedAt: row.completedAt,
      completedByUserId: row.completedByUserId,
      migratedFromLegacy: row.migratedFromLegacy,
      migrationSource: row.migrationSource,
      dismissedHints: Array.isArray(row.dismissedHints)
        ? (row.dismissedHints as string[])
        : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function computeGoLiveSnapshot(
  readiness: GoLiveReadinessResponse,
  isPublished: boolean,
): { progress: number; isReady: boolean } {
  let score = 0;
  if (readiness.dishCount > 0) score += 20;
  if (readiness.mpConnected === true) score += 20;
  if (readiness.completedOrdersCount > 0) score += 20;
  if (isPublished) score += 20;
  if (readiness.dailyOpeningComplete) score += 20;

  const progress = Math.min(100, score);
  return { progress, isReady: progress >= 80 };
}
