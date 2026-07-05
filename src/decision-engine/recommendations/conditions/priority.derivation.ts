import type {
  RecommendationCatalogEntry,
  RecommendationPriority,
} from '../catalog/recommendation-catalog.loader';
import type { DetectedOpportunity } from '../../opportunities/types/opportunity.types';
import type { RecommendationView } from '../context/recommendation-context.helper';

export function deriveRecommendationPriority(
  entry: RecommendationCatalogEntry,
  opportunity: DetectedOpportunity | undefined,
  view: RecommendationView,
): RecommendationPriority {
  if (entry.code === 'REC-SAV-01') {
    return 'critical';
  }

  if (entry.code === 'REC-FIX-01') {
    return 'critical';
  }

  if (opportunity?.priority === 'critical') {
    return 'critical';
  }

  if (view.snapshot.rss.band === 'critical' && entry.strategy === 'recover') {
    return 'critical';
  }

  if (opportunity) {
    return opportunity.priority;
  }

  return entry.basePriority;
}

export function explainRecommendationPriority(
  priority: RecommendationPriority,
  entry: RecommendationCatalogEntry,
  opportunity: DetectedOpportunity | undefined,
  view: RecommendationView,
): string {
  if (entry.code === 'REC-SAV-01') {
    return 'Prioridad critical: cancelación iniciada (INV-16, P25).';
  }
  if (opportunity) {
    return `Prioridad ${priority} heredada de ${opportunity.code} (${opportunity.priority}) y banda RSS ${view.snapshot.rss.bandLabel}.`;
  }
  return `Prioridad ${priority} según catálogo REC y banda RSS ${view.snapshot.rss.bandLabel}.`;
}
