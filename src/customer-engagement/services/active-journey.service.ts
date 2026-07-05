import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JourneySelection } from '../types/journey.types';

const RISK_JOURNEY_TYPES = new Set(['recovery', 'save']);

@Injectable()
export class ActiveJourneyService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveRiskJourney(restaurantId: string): Promise<boolean> {
    const count = await this.prisma.engagementActiveJourney.count({
      where: {
        restaurantId,
        status: 'ACTIVE',
        journeyType: { in: ['recovery', 'save'] },
      },
    });
    return count > 0;
  }

  async startOrUpdateJourney(
    restaurantId: string,
    journey: JourneySelection,
  ): Promise<void> {
    if (RISK_JOURNEY_TYPES.has(journey.journeyType)) {
      await this.prisma.engagementActiveJourney.updateMany({
        where: {
          restaurantId,
          status: 'ACTIVE',
          journeyType: { in: ['recovery', 'save'] },
          journeyId: { not: journey.journeyId },
        },
        data: { status: 'SUPERSEDED', completedAt: new Date() },
      });
    }

    const existing = await this.prisma.engagementActiveJourney.findFirst({
      where: {
        restaurantId,
        journeyId: journey.journeyId,
        status: 'ACTIVE',
      },
    });

    if (existing) {
      await this.prisma.engagementActiveJourney.update({
        where: { id: existing.id },
        data: {
          currentStepIndex: journey.stepIndex,
          lastTouchAt: new Date(),
          sourceRecommendationCode: journey.sourceRecommendationCode,
          sourceRecommendationId: journey.sourceRecommendationId,
        },
      });
      return;
    }

    await this.prisma.engagementActiveJourney.create({
      data: {
        restaurantId,
        journeyId: journey.journeyId,
        journeyType: journey.journeyType,
        sourceRecommendationCode: journey.sourceRecommendationCode,
        sourceRecommendationId: journey.sourceRecommendationId,
        currentStepIndex: journey.stepIndex,
        lastTouchAt: new Date(),
      },
    });
  }

  async listActiveForRestaurant(restaurantId: string) {
    return this.prisma.engagementActiveJourney.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });
  }

  async completeJourney(
    restaurantId: string,
    journeyId: string,
  ): Promise<void> {
    await this.prisma.engagementActiveJourney.updateMany({
      where: { restaurantId, journeyId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
