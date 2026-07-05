import type { RecommendationConfidence } from '../catalog/recommendation-catalog.loader';
import type { DetectedOpportunity } from '../../opportunities/types/opportunity.types';

export function deriveRecommendationConfidence(
  opportunity: DetectedOpportunity | undefined,
): RecommendationConfidence {
  if (!opportunity) {
    return 'medium';
  }
  return opportunity.confidence;
}

export function explainRecommendationConfidence(
  confidence: RecommendationConfidence,
  opportunity: DetectedOpportunity | undefined,
): string {
  if (opportunity) {
    return `Confianza ${confidence} heredada de la oportunidad ${opportunity.code} (${opportunity.confidence}).`;
  }
  return `Confianza ${confidence} por inferencia desde oportunidades del snapshot.`;
}
