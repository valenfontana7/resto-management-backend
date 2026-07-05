import {
  CommercialRelation,
  CommercialRelationStage,
  Lead,
  LeadStatus,
} from '@prisma/client';

export const COMMERCIAL_STAGE_LABELS: Record<CommercialRelationStage, string> =
  {
    DISCOVERED: 'Descubierto',
    LEAD: 'Lead',
    LEAD_ENRICHED: 'Lead enriquecido',
    LEAD_QUALIFIED: 'Lead calificado',
    FIRST_CONTACT: 'Primer contacto',
    INTERESTED: 'Interesado',
    DEMO_REQUESTED: 'Demo solicitada',
    DEMO_DONE: 'Demo realizada',
    FOLLOW_UP: 'Seguimiento',
    TRIAL: 'Prueba',
    CLIENT: 'Cliente',
    ACTIVE_CLIENT: 'Cliente activo',
    ADVANCED_CLIENT: 'Cliente avanzado',
    PROMOTER: 'Promotor',
    RECOVERY: 'Recuperación',
  };

export function mapLeadStatusToCommercialStage(
  status: LeadStatus,
): CommercialRelationStage {
  switch (status) {
    case LeadStatus.NEW:
      return CommercialRelationStage.LEAD;
    case LeadStatus.ANALYZED:
      return CommercialRelationStage.LEAD_ENRICHED;
    case LeadStatus.CONTACTED:
      return CommercialRelationStage.FIRST_CONTACT;
    case LeadStatus.INTERESTED:
      return CommercialRelationStage.INTERESTED;
    case LeadStatus.MEETING_SCHEDULED:
      return CommercialRelationStage.DEMO_REQUESTED;
    case LeadStatus.CLIENT:
      return CommercialRelationStage.CLIENT;
    case LeadStatus.LOST:
      return CommercialRelationStage.RECOVERY;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function computeIntentScore(lead: Lead): number {
  const base: Record<LeadStatus, number> = {
    NEW: 10,
    ANALYZED: 25,
    CONTACTED: 45,
    INTERESTED: 70,
    MEETING_SCHEDULED: 82,
    CLIENT: 92,
    LOST: 12,
  };
  const demoBoost = Math.min((lead.demoViewCount ?? 0) * 5, 20);
  return Math.min(100, base[lead.status] + demoBoost);
}

export function computePriorityScore(
  intentScore: number,
  opportunityScore: number,
): number {
  return Math.round(intentScore * 0.45 + opportunityScore * 0.55);
}

export function buildPresenceFromLead(lead: Lead) {
  return {
    instagram: lead.instagram ? 'present' : 'absent',
    google: lead.city ? 'present' : 'unknown',
    pedidosYa: 'unknown',
    website: lead.hasWebsite || lead.website ? 'present' : 'absent',
  };
}

export function buildChannelsFromLead(lead: Lead): string[] {
  const channels: string[] = [];
  if (lead.whatsapp) channels.push('whatsapp');
  if (lead.email) channels.push('email');
  if (lead.instagram) channels.push('instagram');
  if (lead.phone) channels.push('phone');
  return channels;
}

export function buildTagsFromLead(
  lead: Lead,
  intentScore: number,
  isOverdue: boolean,
): string[] {
  const tags = new Set<string>();
  if (intentScore >= 70) tags.add('hot');
  if (lead.status === LeadStatus.LOST || isOverdue) tags.add('risk');
  if (
    lead.status === LeadStatus.MEETING_SCHEDULED ||
    (lead.demoViewCount ?? 0) > 0
  ) {
    tags.add('post_demo');
  }
  return [...tags];
}

export function defaultNextAction(stage: CommercialRelationStage): string {
  switch (stage) {
    case CommercialRelationStage.DISCOVERED:
    case CommercialRelationStage.LEAD:
      return 'Enriquecer datos del prospecto';
    case CommercialRelationStage.LEAD_ENRICHED:
      return 'Calificar fit y definir Job dominante';
    case CommercialRelationStage.LEAD_QUALIFIED:
      return 'Primer contacto con ángulo de dolor';
    case CommercialRelationStage.FIRST_CONTACT:
      return 'Dar seguimiento al primer contacto';
    case CommercialRelationStage.INTERESTED:
      return 'Proponer demo centrada en el Job';
    case CommercialRelationStage.DEMO_REQUESTED:
      return 'Confirmar demo y preparar ángulo';
    case CommercialRelationStage.DEMO_DONE:
      return 'Enviar seguimiento post-demo';
    case CommercialRelationStage.FOLLOW_UP:
      return 'Retomar conversación con un solo next step';
    case CommercialRelationStage.TRIAL:
      return 'Acompañar activación del canal';
    case CommercialRelationStage.CLIENT:
    case CommercialRelationStage.ACTIVE_CLIENT:
    case CommercialRelationStage.ADVANCED_CLIENT:
      return 'Revisar adopción y próximo hito de valor';
    case CommercialRelationStage.PROMOTER:
      return 'Pedir referido o caso de éxito';
    case CommercialRelationStage.RECOVERY:
      return 'Evaluar si reactivar o cerrar honestamente';
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function defaultSignalSummary(
  lead: Lead,
  stage: CommercialRelationStage,
): string {
  const parts: string[] = [];
  parts.push(`Estado Leads: ${lead.status}`);
  if (lead.score > 0) parts.push(`Score ${lead.score}`);
  if ((lead.demoViewCount ?? 0) > 0) {
    parts.push(`Demo vista ${lead.demoViewCount}×`);
  }
  if (stage === CommercialRelationStage.RECOVERY) {
    parts.push('Relación en recuperación');
  }
  return parts.join(' · ');
}

export function defaultNextActionDue(): Date {
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(18, 0, 0, 0);
  return due;
}

import type {
  IntelligenceBriefDto,
  RelationCardDto,
} from './intelligence-brief.dto';

export function mapStageFamily(
  stage: CommercialRelationStage,
): RelationCardDto['stageFamily'] {
  switch (stage) {
    case CommercialRelationStage.DISCOVERED:
    case CommercialRelationStage.LEAD:
    case CommercialRelationStage.LEAD_ENRICHED:
    case CommercialRelationStage.LEAD_QUALIFIED:
      return 'early';
    case CommercialRelationStage.FIRST_CONTACT:
    case CommercialRelationStage.INTERESTED:
      return 'conversation';
    case CommercialRelationStage.DEMO_REQUESTED:
    case CommercialRelationStage.DEMO_DONE:
      return 'demo';
    case CommercialRelationStage.FOLLOW_UP:
    case CommercialRelationStage.TRIAL:
    case CommercialRelationStage.CLIENT:
    case CommercialRelationStage.ACTIVE_CLIENT:
    case CommercialRelationStage.ADVANCED_CLIENT:
    case CommercialRelationStage.PROMOTER:
      return 'close';
    case CommercialRelationStage.RECOVERY:
      return 'risk';
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function toRelationCardDto(
  relation: CommercialRelation,
  ownerFallback: string,
  lead?: Lead | null,
  intelligence?: IntelligenceBriefDto | null,
): RelationCardDto {
  const presence =
    (relation.presence as ReturnType<typeof buildPresenceFromLead> | null) ??
    (lead
      ? buildPresenceFromLead(lead)
      : {
          instagram: 'unknown',
          google: 'unknown',
          pedidosYa: 'unknown',
          website: 'unknown',
        });
  const tags = Array.isArray(relation.tags) ? (relation.tags as string[]) : [];
  const channelsAvailable = lead
    ? buildChannelsFromLead(lead)
    : ['whatsapp', 'email'];

  const nextActionDue = relation.nextActionDue ?? new Date();
  const isOverdue = nextActionDue.getTime() < Date.now();

  const nextAction =
    intelligence?.topRecommendation?.title ??
    intelligence?.topOpportunity?.title ??
    relation.nextAction ??
    defaultNextAction(relation.stage);

  const signalSummary =
    intelligence?.queueRankReason ??
    relation.signalSummary ??
    (lead ? defaultSignalSummary(lead, relation.stage) : '');

  const primaryJob =
    intelligence?.topRecommendation?.primaryJob ?? relation.primaryJob ?? null;

  return {
    id: relation.id,
    leadId: relation.leadId,
    convertedRestaurantId: relation.convertedRestaurantId,
    name: relation.name,
    stage: COMMERCIAL_STAGE_LABELS[relation.stage],
    stageFamily: mapStageFamily(relation.stage),
    priorityScore: relation.priorityScore,
    intentScore: relation.intentScore,
    opportunityScore: relation.opportunityScore,
    primaryJob,
    signalSummary,
    nextAction,
    nextActionDue: nextActionDue.toISOString(),
    isOverdue,
    channelsAvailable,
    ownerId: relation.ownerId ?? ownerFallback,
    neighborhood: relation.neighborhood ?? lead?.city ?? '',
    localType: relation.localType ?? lead?.category ?? '',
    branches: relation.branches,
    presence,
    tags: tags,
    intelligence: intelligence ?? null,
  };
}
