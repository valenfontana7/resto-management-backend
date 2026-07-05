import type {
  OpportunityCatalogEntry,
  OpportunityConfidence,
} from '../catalog/opportunity-catalog.loader';

export function deriveOpportunityConfidence(
  entry: OpportunityCatalogEntry,
  supportingPresent: string[],
  inferredFromRss: boolean,
): OpportunityConfidence {
  const required = entry.requiredSignals ?? [];
  const allRequiredPresent =
    required.length === 0 ||
    required.every((code) => supportingPresent.includes(code));

  if (allRequiredPresent && !inferredFromRss) {
    return entry.baseConfidence === 'medium' ? 'high' : entry.baseConfidence;
  }

  if (inferredFromRss && required.length === 0) {
    return 'medium';
  }

  if (!allRequiredPresent && required.length > 0) {
    return 'low';
  }

  return entry.baseConfidence;
}

export function explainConfidence(
  confidence: OpportunityConfidence,
  supportingPresent: string[],
  entry: OpportunityCatalogEntry,
): string {
  const required = entry.requiredSignals ?? [];
  if (
    required.length > 0 &&
    required.every((c) => supportingPresent.includes(c))
  ) {
    return `Confianza ${confidence}: todas las señales requeridas (${required.join(', ')}) están activas en el snapshot.`;
  }
  if (required.length === 0) {
    return `Confianza ${confidence}: condición inferida desde RSS y dimensiones del snapshot.`;
  }
  return `Confianza ${confidence}: evidencia parcial en el snapshot.`;
}
