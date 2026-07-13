import type { Lead } from '@prisma/client';
import { normalizeInstagramHandle } from './leads-discovery.helpers';

export type ResearchVerdict = 'SUFICIENTE' | 'INSUFICIENTE';

export interface ResearchAssessment {
  verdict: ResearchVerdict;
  reason: string;
  identityVerified: boolean;
  menuVerified: boolean;
  /** true cuando se sigue sin carta y el menú se omite en el bundle */
  menuSkipped: boolean;
  sourcesFound: string[];
  blockers: string[];
  /** Mensaje corto para UI del pipeline */
  summaryMessage: string;
}

export const RESEARCH_ASSESSMENT_SCHEMA = {
  type: 'object',
  required: [
    'verdict',
    'reason',
    'identityVerified',
    'menuVerified',
    'sourcesFound',
    'blockers',
  ],
  properties: {
    verdict: { type: 'string' },
    reason: { type: 'string' },
    identityVerified: { type: 'boolean' },
    menuVerified: { type: 'boolean' },
    sourcesFound: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
} as const;

export class InsufficientResearchError extends Error {
  readonly assessment: ResearchAssessment;
  readonly researchSummary: string;

  constructor(assessment: ResearchAssessment, researchSummary: string) {
    super(assessment.summaryMessage);
    this.name = 'InsufficientResearchError';
    this.assessment = assessment;
    this.researchSummary = researchSummary;
  }
}

export function buildEmptyMenuBlock(): {
  menu: {
    currency: string;
    priceSource: string;
    categories: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
  };
} {
  return {
    menu: {
      currency: 'ARS',
      priceSource: 'sin carta pública verificable',
      categories: [],
      products: [],
    },
  };
}

export function buildResearchAssessmentSummary(
  assessment: Omit<ResearchAssessment, 'summaryMessage'>,
  lead: Lead,
): string {
  if (assessment.verdict === 'SUFICIENTE' && assessment.menuVerified) {
    return `Datos verificables suficientes · ${assessment.sourcesFound.slice(0, 3).join(', ') || 'fuentes OK'}`;
  }

  if (assessment.verdict === 'SUFICIENTE' && assessment.menuSkipped) {
    const ig = normalizeInstagramHandle(lead.instagram);
    return [
      'Identidad OK · menú omitido (sin carta/precios públicos).',
      ig ? `IG @${ig} no alcanza para inventar platos.` : null,
      'La demo se arma sin carta; se puede completar después.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const parts = [
    assessment.reason.trim() ||
      'No hay información verificable suficiente para armar una demo.',
  ];

  if (!assessment.identityVerified) {
    parts.push(
      'No se pudo confirmar que el local exista. Revisá el lead o agregá fuentes (web, Google Maps, Instagram indexado).',
    );
  }

  if (assessment.blockers.length) {
    parts.push(`Bloqueos: ${assessment.blockers.slice(0, 4).join('; ')}`);
  }

  return parts.join(' ');
}

export function parseVerdictBlockFromResearch(research: string): {
  verdict?: ResearchVerdict;
  menuVerified?: boolean;
  identityVerified?: boolean;
  reason?: string;
} {
  const verdictMatch = research.match(
    /VEREDICTO\s*:\s*(SUFICIENTE|INSUFICIENTE)/i,
  );
  const menuMatch = research.match(/MENU_VERIFICADO\s*:\s*(si|no)/i);
  const identityMatch = research.match(/IDENTIDAD_VERIFICADA\s*:\s*(si|no)/i);
  const reasonMatch = research.match(/MOTIVO\s*:\s*(.+)/i);

  return {
    verdict: verdictMatch
      ? (verdictMatch[1].toUpperCase() as ResearchVerdict)
      : undefined,
    menuVerified: menuMatch ? menuMatch[1].toLowerCase() === 'si' : undefined,
    identityVerified: identityMatch
      ? identityMatch[1].toLowerCase() === 'si'
      : undefined,
    reason: reasonMatch?.[1]?.trim(),
  };
}

/**
 * Heurística: presencia pública inexistente (no solo "sin menú").
 */
export function heuristicInsufficientResearch(research: string): boolean {
  const text = research.toLowerCase();
  const negativeSignals = [
    'no se encontró información',
    'no se encontro informacion',
    'sin información verificable',
    'sin informacion verificable',
    'no hay información verificable',
    'no hay informacion verificable',
    'presencia digital significativa',
    'nombre o la información inicial sean incorrectos',
    'no encontré el restaurante',
    'no encontre el restaurante',
    'no existe presencia digital',
  ];

  const identitySignals = [
    'instagram.com/',
    'google maps',
    'maps.google',
    'dirección',
    'direccion',
    'barrio',
    '@',
    'perfil encontrado',
    'local confirmado',
    'identidad_verificada: si',
  ];

  const hitNegative = negativeSignals.some((s) => text.includes(s));
  const hitIdentity = identitySignals.some((s) => text.includes(s));

  // Solo corta si el texto niega presencia y no hay señales de identidad.
  if (hitNegative && !hitIdentity) return true;

  if (research.trim().length < 280 && hitNegative && !hitIdentity) return true;

  return false;
}

export function mergeAssessmentWithHeuristics(
  assessment: Omit<ResearchAssessment, 'summaryMessage' | 'menuSkipped'>,
  research: string,
  lead: Lead,
): ResearchAssessment {
  let next: Omit<ResearchAssessment, 'summaryMessage'> = {
    ...assessment,
    menuSkipped: false,
  };

  if (heuristicInsufficientResearch(research)) {
    next = {
      ...next,
      verdict: 'INSUFICIENTE',
      identityVerified: false,
      menuVerified: false,
      blockers: Array.from(
        new Set([...next.blockers, 'heuristic_no_verifiable_presence']),
      ),
      reason:
        next.reason.trim() ||
        'La investigación indica que no hay datos públicos verificables del local.',
    };
  }

  // Sin menú: no aborta. Se omite la carta en el bundle.
  if (!next.menuVerified && next.identityVerified) {
    next = {
      ...next,
      verdict: 'SUFICIENTE',
      menuSkipped: true,
      blockers: Array.from(
        new Set([
          ...next.blockers.filter((b) => b !== 'menu_not_verified'),
          'menu_skipped',
        ]),
      ),
      reason:
        next.reason.trim() ||
        'Identidad confirmada; sin carta/precios públicos (menú omitido).',
    };
  }

  if (!next.identityVerified) {
    next = {
      ...next,
      verdict: 'INSUFICIENTE',
      menuSkipped: false,
      blockers: Array.from(
        new Set([...next.blockers, 'identity_not_verified']),
      ),
    };
  }

  // Identidad mínima desde el CRM del lead (IG/web) si la web no confirma presencia.
  // Sin carta → menú omitido; solo abortamos si no hay ni identidad research ni CRM.
  const ig = normalizeInstagramHandle(lead.instagram);
  const hasLeadIdentity = Boolean(ig || lead.website?.trim());

  if (
    next.verdict === 'INSUFICIENTE' &&
    !next.identityVerified &&
    hasLeadIdentity
  ) {
    next = {
      ...next,
      verdict: 'SUFICIENTE',
      identityVerified: true,
      menuVerified: false,
      menuSkipped: true,
      blockers: Array.from(
        new Set([
          ...next.blockers.filter((b) => b !== 'identity_not_verified'),
          'menu_skipped',
          ig ? 'identity_from_lead_instagram' : 'identity_from_lead_website',
        ]),
      ),
      reason: ig
        ? `Identidad mínima desde el lead (Instagram @${ig}); sin carta pública — menú omitido.`
        : 'Identidad mínima desde el lead (website); sin carta pública — menú omitido.',
    };
  }

  return {
    ...next,
    summaryMessage: buildResearchAssessmentSummary(next, lead),
  };
}
