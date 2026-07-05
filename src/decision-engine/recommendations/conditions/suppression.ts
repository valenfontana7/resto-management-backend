import type { RecommendationCatalogEntry } from '../catalog/recommendation-catalog.loader';
import type { RecommendationView } from '../context/recommendation-context.helper';
import {
  hasConfigRegression,
  isChampionBand,
} from '../context/recommendation-context.helper';

export interface SuppressionResult {
  suppressed: boolean;
  reason?: string;
}

export function checkRecommendationSuppression(
  entry: RecommendationCatalogEntry,
  view: RecommendationView,
): SuppressionResult {
  if (view.suppression.includes(entry.code)) {
    return {
      suppressed: true,
      reason: `Suppression flag activo para ${entry.code}`,
    };
  }

  if (
    entry.championBlocked &&
    isChampionBand(view) &&
    !hasConfigRegression(view)
  ) {
    return {
      suppressed: true,
      reason: 'Champion: REC de activación básica bloqueada (INV-18)',
    };
  }

  const activeDuplicate = view.activeRecommendations.find(
    (r) => r.code === entry.code,
  );
  if (activeDuplicate) {
    return {
      suppressed: true,
      reason: 'Recomendación ya activa (idempotencia)',
    };
  }

  return { suppressed: false };
}
