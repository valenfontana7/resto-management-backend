import { Injectable } from '@nestjs/common';
import {
  findJourneyByRecommendationCode,
  getJourneyById,
} from '../catalog/journey-catalog.loader';
import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';
import type { JourneySelection } from '../types/journey.types';

@Injectable()
export class JourneySelector {
  select(
    recommendation: DetectedRecommendation,
    stepIndex = 0,
  ): JourneySelection | null {
    const hintedId = recommendation.consumerHints.journeyId ?? null;
    const journey =
      (hintedId ? getJourneyById(hintedId) : null) ??
      findJourneyByRecommendationCode(recommendation.code);

    if (!journey || journey.steps.length === 0) {
      return null;
    }

    const safeIndex = Math.min(
      Math.max(0, stepIndex),
      journey.steps.length - 1,
    );
    const currentStep = journey.steps[safeIndex];

    return {
      journeyId: journey.id,
      journeyName: journey.name,
      objective: journey.objective,
      journeyType: journey.journeyType,
      currentStep,
      stepIndex: safeIndex,
      totalSteps: journey.steps.length,
      sourceRecommendationCode: recommendation.code,
      sourceRecommendationId: recommendation.id,
    };
  }
}
