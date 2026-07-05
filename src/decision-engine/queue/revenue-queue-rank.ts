import type { CommercialRelationStage } from '@prisma/client';
import type { QueueRankMeta } from '../types/restaurant-intelligence-bundle.v1';

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const BAND_ORDER: Record<string, number> = {
  critical: 0,
  at_risk: 1,
  attention: 2,
  healthy: 3,
  champion: 4,
};

/** Lifecycle comercial — dominio Revenue, no heurística de inteligencia. */
const LIFECYCLE_STAGE_ORDER: Record<CommercialRelationStage, number> = {
  RECOVERY: 0,
  TRIAL: 1,
  FOLLOW_UP: 2,
  DEMO_DONE: 3,
  DEMO_REQUESTED: 4,
  INTERESTED: 5,
  FIRST_CONTACT: 6,
  CLIENT: 7,
  ACTIVE_CLIENT: 8,
  ADVANCED_CLIENT: 9,
  PROMOTER: 10,
  LEAD_QUALIFIED: 11,
  LEAD_ENRICHED: 12,
  LEAD: 13,
  DISCOVERED: 14,
};

export function buildQueueRankMeta(
  lifecycleStage: CommercialRelationStage,
  topRecommendation: {
    code: string;
    priority: string;
    summary: string;
  } | null,
  topOpportunity: { code: string; priority: string; title: string } | null,
  rss: { band: string; value: number } | null,
): QueueRankMeta {
  let primaryReason: string;

  if (topRecommendation) {
    primaryReason = `Recomendación ${topRecommendation.code} (${topRecommendation.priority}): ${topRecommendation.summary}`;
  } else if (topOpportunity) {
    primaryReason = `Oportunidad ${topOpportunity.code} (${topOpportunity.priority}): ${topOpportunity.title}`;
  } else if (rss) {
    primaryReason = `RSS ${rss.value} — banda ${rss.band}`;
  } else {
    primaryReason = `Lifecycle ${lifecycleStage} — sin evaluación de inteligencia disponible`;
  }

  return {
    recommendationPriority: topRecommendation?.priority ?? null,
    recommendationCode: topRecommendation?.code ?? null,
    opportunityPriority: topOpportunity?.priority ?? null,
    opportunityCode: topOpportunity?.code ?? null,
    rssBand: rss?.band ?? null,
    rssValue: rss?.value ?? null,
    lifecycleStage,
    primaryReason,
  };
}

export function compareRevenueQueueRank(
  a: QueueRankMeta,
  b: QueueRankMeta,
  stageA: CommercialRelationStage,
  stageB: CommercialRelationStage,
): number {
  const recA = a.recommendationPriority
    ? (PRIORITY_ORDER[a.recommendationPriority] ?? 99)
    : 99;
  const recB = b.recommendationPriority
    ? (PRIORITY_ORDER[b.recommendationPriority] ?? 99)
    : 99;
  if (recA !== recB) return recA - recB;

  const oppA = a.opportunityPriority
    ? (PRIORITY_ORDER[a.opportunityPriority] ?? 99)
    : 99;
  const oppB = b.opportunityPriority
    ? (PRIORITY_ORDER[b.opportunityPriority] ?? 99)
    : 99;
  if (oppA !== oppB) return oppA - oppB;

  const bandA = a.rssBand ? (BAND_ORDER[a.rssBand] ?? 99) : 99;
  const bandB = b.rssBand ? (BAND_ORDER[b.rssBand] ?? 99) : 99;
  if (bandA !== bandB) return bandA - bandB;

  const lifeA = LIFECYCLE_STAGE_ORDER[stageA] ?? 99;
  const lifeB = LIFECYCLE_STAGE_ORDER[stageB] ?? 99;
  if (lifeA !== lifeB) return lifeA - lifeB;

  return (a.recommendationCode ?? a.opportunityCode ?? '').localeCompare(
    b.recommendationCode ?? b.opportunityCode ?? '',
  );
}
