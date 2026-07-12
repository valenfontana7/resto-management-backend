import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalEventEmitter } from '../event-spine/operational-event-emitter.service';
import { OPERATIONAL_EVENT_TYPES } from '../event-spine/operational-event.types';
import {
  businessRulesPatchForIntent,
  type OnboardingProductIntent,
} from '../restaurants/onboarding-product-intent';
import { normalizeRestaurantFeatures } from '../common/utils/restaurant-features.util';
import { adjustFeaturesForPlan } from '../subscriptions/constants';
import { PlanType } from '../subscriptions/dto';
import { SubscriptionResolverService } from '../subscriptions/subscription-resolver.service';
import type {
  CompleteOperationalProfileWizardDto,
  OperationalProfileWizardStepDto,
  ResetOperationalProfileDto,
  UpdateOperationalProfileDto,
} from './dto/operational-profile.dto';
import {
  channelsFromFocusAreas,
  featuresForOperationalModel,
} from './operational-profile-features';
import { inferProfileFromLegacy } from './operational-profile-inference';
import {
  defaultFocusAreasForModel,
  projectOperationalProfile,
  startFocusOptionsForModel,
} from './operational-profile-projector';
import type {
  BusinessPriorities,
  FocusArea,
  OperationalModel,
  OperationalProfileRecord,
  OperationalProfileResponse,
  ProfileStatus,
} from './operational-profile.types';
import {
  CURRENT_WIZARD_VERSION,
  WIZARD_STEP_IDS,
} from './operational-profile.types';

@Injectable()
export class OperationalProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: OperationalEventEmitter,
    private readonly subscriptionResolver: SubscriptionResolverService,
  ) {}

  async getOrCreateProfile(
    restaurantId: string,
    userId?: string,
  ): Promise<OperationalProfileResponse> {
    let row = await this.prisma.restaurantOperationalProfile.findUnique({
      where: { restaurantId },
    });

    if (!row) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          businessRules: true,
          features: true,
          onboardingIncomplete: true,
          createdAt: true,
          _count: { select: { orders: true, tableSessions: true } },
        },
      });

      if (!restaurant) {
        throw new NotFoundException('Restaurant not found');
      }

      const hasLegacyIntent = Boolean(
        (
          restaurant.businessRules as {
            onboarding?: { productIntent?: string };
          } | null
        )?.onboarding?.productIntent,
      );

      if (hasLegacyIntent || restaurant.onboardingIncomplete === false) {
        const inferred = inferProfileFromLegacy({
          id: restaurant.id,
          businessRules: restaurant.businessRules,
          features: restaurant.features,
          onboardingIncomplete: restaurant.onboardingIncomplete,
          createdAt: restaurant.createdAt,
          _count: restaurant._count,
        });

        row = await this.prisma.restaurantOperationalProfile.create({
          data: {
            restaurantId,
            schemaVersion: inferred.schemaVersion,
            operationalModel: inferred.operationalModel,
            maturityLevel: inferred.maturityLevel,
            focusAreas: inferred.focusAreas,
            businessPriorities:
              inferred.businessPriorities as unknown as Prisma.InputJsonValue,
            capabilitySnapshot: (inferred.capabilitySnapshot ??
              Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
            profileStatus: inferred.profileStatus,
            completedWizardVersion: inferred.completedWizardVersion,
            completedStepIds: inferred.completedStepIds,
            completedAt: inferred.completedAt,
            completedByUserId: inferred.completedByUserId,
            migratedFromLegacy: inferred.migratedFromLegacy,
            migrationSource: inferred.migrationSource,
          },
        });
      } else {
        row = await this.prisma.restaurantOperationalProfile.create({
          data: {
            restaurantId,
            profileStatus: 'pending',
            operationalModel: 'mixed',
            focusAreas: [],
            businessPriorities: {},
            completedStepIds: [],
          },
        });

        this.emitProfileEvent(
          OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_STARTED,
          restaurantId,
          { userId },
        );
      }
    }

    return this.buildResponse(row, restaurantId);
  }

  async updateProfile(
    restaurantId: string,
    dto: UpdateOperationalProfileDto,
    userId: string,
  ): Promise<OperationalProfileResponse> {
    const existing = await this.ensureProfileRow(restaurantId);

    const focusAreas =
      dto.focusAreas ?? this.parseFocusAreas(existing.focusAreas);
    const operationalModel =
      dto.operationalModel ?? (existing.operationalModel as OperationalModel);
    const businessPriorities =
      dto.businessPriorities ??
      this.parseBusinessPriorities(existing.businessPriorities);

    const row = await this.prisma.restaurantOperationalProfile.update({
      where: { restaurantId },
      data: {
        operationalModel,
        focusAreas,
        businessPriorities:
          businessPriorities as unknown as Prisma.InputJsonValue,
        profileStatus: 'completed',
        completedWizardVersion:
          existing.completedWizardVersion ?? CURRENT_WIZARD_VERSION,
      },
    });

    await this.syncLegacyAndFeatures(
      restaurantId,
      operationalModel,
      focusAreas,
    );

    this.emitProfileEvent(
      OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_UPDATED,
      restaurantId,
      {
        userId,
        operationalModel,
      },
    );

    return this.buildResponse(row, restaurantId);
  }

  async completeWizard(
    restaurantId: string,
    dto: CompleteOperationalProfileWizardDto,
    userId: string,
  ): Promise<OperationalProfileResponse> {
    const operationalModel = dto.operationalModel;
    const startFocus = dto.startFocus;

    if (!operationalModel) {
      throw new BadRequestException(
        'operationalModel is required to complete wizard',
      );
    }

    if (!startFocus) {
      throw new BadRequestException(
        'startFocus is required to complete wizard',
      );
    }

    if (!dto.businessPriorities?.primary) {
      throw new BadRequestException('businessPriorities.primary is required');
    }

    const allowedStart = startFocusOptionsForModel(operationalModel);
    if (!allowedStart.includes(startFocus)) {
      throw new BadRequestException(
        'startFocus is not valid for operationalModel',
      );
    }

    const focusAreas = dto.focusAreas?.length
      ? [...new Set([startFocus, ...dto.focusAreas])]
      : this.buildFocusAreasFromWizard(operationalModel, startFocus);

    const completedStepIds = dto.completedStepIds ?? [...WIZARD_STEP_IDS];

    const capabilitySnapshot = {
      featuresAtCompletion: featuresForOperationalModel(
        operationalModel,
        focusAreas,
      ),
      channelsDeclared: channelsFromFocusAreas(focusAreas),
    };

    await this.ensureProfileRow(restaurantId);

    const row = await this.prisma.restaurantOperationalProfile.update({
      where: { restaurantId },
      data: {
        operationalModel,
        focusAreas,
        businessPriorities:
          dto.businessPriorities as unknown as Prisma.InputJsonValue,
        capabilitySnapshot:
          capabilitySnapshot as unknown as Prisma.InputJsonValue,
        profileStatus: 'completed',
        completedWizardVersion: CURRENT_WIZARD_VERSION,
        completedStepIds,
        completedAt: new Date(),
        completedByUserId: userId,
        maturityLevel: 'basic',
      },
    });

    await this.syncLegacyAndFeatures(
      restaurantId,
      operationalModel,
      focusAreas,
    );

    this.emitProfileEvent(
      OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_COMPLETED,
      restaurantId,
      {
        userId,
        operationalModel,
        focusAreas,
      },
    );

    return this.buildResponse(row, restaurantId);
  }

  async recordWizardStep(
    restaurantId: string,
    dto: OperationalProfileWizardStepDto,
    userId: string,
  ): Promise<OperationalProfileResponse> {
    const existing = await this.ensureProfileRow(restaurantId);
    const completedStepIds = new Set(
      this.parseStepIds(existing.completedStepIds),
    );
    completedStepIds.add(dto.stepId);

    const updateData: Prisma.RestaurantOperationalProfileUpdateInput = {
      profileStatus: 'in_progress',
      completedStepIds: [...completedStepIds],
    };

    if (dto.operationalModel)
      updateData.operationalModel = dto.operationalModel;
    if (dto.startFocus || dto.focusAreas) {
      const model = (dto.operationalModel ??
        existing.operationalModel) as OperationalModel;
      const start =
        dto.startFocus ?? this.parseFocusAreas(existing.focusAreas)[0];
      updateData.focusAreas = dto.focusAreas?.length
        ? dto.focusAreas
        : start
          ? this.buildFocusAreasFromWizard(model, start)
          : defaultFocusAreasForModel(model);
    }
    if (dto.businessPriorities) {
      updateData.businessPriorities =
        dto.businessPriorities as unknown as Prisma.InputJsonValue;
    }

    const row = await this.prisma.restaurantOperationalProfile.update({
      where: { restaurantId },
      data: updateData,
    });

    this.emitProfileEvent(
      OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_STEP_COMPLETED,
      restaurantId,
      { userId, stepId: dto.stepId },
    );

    return this.buildResponse(row, restaurantId);
  }

  async resetProfile(
    restaurantId: string,
    _dto: ResetOperationalProfileDto,
    userId: string,
  ): Promise<OperationalProfileResponse> {
    await this.ensureProfileRow(restaurantId);

    const row = await this.prisma.restaurantOperationalProfile.update({
      where: { restaurantId },
      data: {
        profileStatus: 'in_progress',
        completedAt: null,
        completedByUserId: null,
        completedWizardVersion: null,
        completedStepIds: [],
        migratedFromLegacy: false,
        migrationSource: null,
      },
    });

    this.emitProfileEvent(
      OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_RESET,
      restaurantId,
      {
        userId,
      },
    );

    return this.buildResponse(row, restaurantId);
  }

  private async ensureProfileRow(restaurantId: string) {
    const existing = await this.prisma.restaurantOperationalProfile.findUnique({
      where: { restaurantId },
    });
    if (existing) return existing;

    return this.prisma.restaurantOperationalProfile.create({
      data: {
        restaurantId,
        profileStatus: 'pending',
        operationalModel: 'mixed',
        focusAreas: [],
        businessPriorities: {},
        completedStepIds: [],
      },
    });
  }

  private async syncLegacyAndFeatures(
    restaurantId: string,
    model: OperationalModel,
    focusAreas: FocusArea[],
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { features: true, businessRules: true },
    });

    if (!restaurant) return;

    const plan =
      await this.subscriptionResolver.resolvePlanIdForRestaurant(restaurantId);
    const seeded = featuresForOperationalModel(model, focusAreas);
    const merged = {
      ...normalizeRestaurantFeatures(restaurant.features),
      ...seeded,
    };
    const features = adjustFeaturesForPlan(merged, plan as PlanType);

    const legacyIntent: OnboardingProductIntent =
      model === 'digital'
        ? 'digital'
        : model === 'salon'
          ? 'operations'
          : 'both';

    const businessRules = {
      ...(typeof restaurant.businessRules === 'object' &&
      restaurant.businessRules !== null
        ? restaurant.businessRules
        : {}),
      ...businessRulesPatchForIntent(legacyIntent),
    };

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        features,
        businessRules,
        modulesUpdatedAt: new Date(),
      },
    });
  }

  private buildFocusAreasFromWizard(
    model: OperationalModel,
    startFocus: FocusArea,
  ): FocusArea[] {
    const defaults = defaultFocusAreasForModel(model);
    return [...new Set([startFocus, ...defaults])];
  }

  private async buildResponse(
    row: {
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
    },
    restaurantId: string,
  ): Promise<OperationalProfileResponse> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { features: true },
    });

    const profile = this.mapRowToRecord(row);
    const features = normalizeRestaurantFeatures(
      restaurant?.features,
    ) as unknown as Record<string, boolean>;

    const projections = projectOperationalProfile(profile, {
      features,
      operatorMaturity: profile.profileStatus === 'completed' ? 'new' : 'new',
    });

    return {
      profile,
      projections,
      shouldShowWelcomeModal: profile.profileStatus === 'pending',
    };
  }

  private mapRowToRecord(row: {
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
      operationalModel: row.operationalModel as OperationalModel,
      maturityLevel:
        row.maturityLevel as OperationalProfileRecord['maturityLevel'],
      focusAreas: this.parseFocusAreas(row.focusAreas),
      businessPriorities: this.parseBusinessPriorities(row.businessPriorities),
      capabilitySnapshot:
        row.capabilitySnapshot as OperationalProfileRecord['capabilitySnapshot'],
      profileStatus: row.profileStatus as ProfileStatus,
      completedWizardVersion: row.completedWizardVersion,
      completedStepIds: this.parseStepIds(row.completedStepIds),
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

  private parseFocusAreas(value: unknown): FocusArea[] {
    return Array.isArray(value) ? (value as FocusArea[]) : [];
  }

  private parseStepIds(value: unknown): string[] {
    return Array.isArray(value) ? (value as string[]) : [];
  }

  private parseBusinessPriorities(value: unknown): BusinessPriorities {
    const raw = value as BusinessPriorities | null | undefined;
    if (raw?.primary) return raw;
    return { primary: 'reliability' };
  }

  private emitProfileEvent(
    eventType: (typeof OPERATIONAL_EVENT_TYPES)[keyof typeof OPERATIONAL_EVENT_TYPES],
    restaurantId: string,
    data: Record<string, unknown>,
  ) {
    this.eventEmitter.emit({
      restaurantId,
      eventType,
      aggregateType: 'operational_profile',
      aggregateId: restaurantId,
      data,
    });
  }
}
