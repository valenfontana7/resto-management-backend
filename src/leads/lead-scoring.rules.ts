export interface LeadScoringInput {
  hasWebsite: boolean;
  hasOnlineMenu: boolean;
  hasReservations: boolean;
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  branchCount: number;
}

export type LeadPriority = 'low' | 'medium' | 'high';

const SCORE_CAP = 100;

export function calculateLeadScore(input: LeadScoringInput): number {
  let score = 0;

  if (!input.hasWebsite) score += 40;
  if (!input.hasReservations) score += 20;
  if (!input.hasOnlineMenu) score += 20;
  if (input.hasWhatsapp) score += 10;
  if (input.hasInstagram) score += 10;
  if (input.branchCount > 1) score += 20;

  return Math.min(score, SCORE_CAP);
}

export function getLeadPriority(score: number): LeadPriority {
  if (score <= 30) return 'low';
  if (score <= 60) return 'medium';
  return 'high';
}

export function buildScoringInputFromLead(lead: {
  hasWebsite: boolean;
  hasOnlineMenu: boolean;
  hasReservations: boolean;
  hasWhatsapp: boolean;
  instagram?: string | null;
  branchCount: number;
}): LeadScoringInput {
  return {
    hasWebsite: lead.hasWebsite,
    hasOnlineMenu: lead.hasOnlineMenu,
    hasReservations: lead.hasReservations,
    hasWhatsapp: lead.hasWhatsapp,
    hasInstagram: Boolean(lead.instagram?.trim()),
    branchCount: lead.branchCount ?? 1,
  };
}
