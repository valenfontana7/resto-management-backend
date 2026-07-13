import type { Lead } from '@prisma/client';
import {
  buildResearchAssessmentSummary,
  heuristicInsufficientResearch,
  mergeAssessmentWithHeuristics,
  parseVerdictBlockFromResearch,
} from './prospect-research-gate';

const lead = {
  businessName: 'Dani Dragón',
  city: 'Liniers',
  instagram: '@danidragon.ok',
} as Lead;

describe('prospect-research-gate', () => {
  it('detecta investigación sin presencia verificable', () => {
    const research = `
Dani Dragón
No se encontró información verificable sobre un restaurante llamado 'Dani Dragón' en Liniers, Argentina.
Es probable que el nombre o la información inicial sean incorrectos, o que el establecimiento no tenga una presencia digital significativa.
VEREDICTO: INSUFICIENTE
MENU_VERIFICADO: no
`;
    expect(heuristicInsufficientResearch(research)).toBe(true);
  });

  it('no marca insuficiente si hay carta con precios', () => {
    const research = `
IDENTIDAD: Confirmado en Google Maps.
CARTA Y PRECIOS:
- Milanesa completa $9800
- Empanadas x12 $7200
- Papas fritas $4500
VEREDICTO: SUFICIENTE
MENU_VERIFICADO: si
`;
    expect(heuristicInsufficientResearch(research)).toBe(false);
  });

  it('permite SUFICIENTE con menú omitido si hay identidad', () => {
    const merged = mergeAssessmentWithHeuristics(
      {
        verdict: 'SUFICIENTE',
        reason: 'Encontramos el IG',
        identityVerified: true,
        menuVerified: false,
        sourcesFound: ['instagram.com/danidragon'],
        blockers: ['instagram_only_no_menu'],
      },
      'Perfil encontrado en Instagram. Sin carta ni precios públicos.',
      lead,
    );

    expect(merged.verdict).toBe('SUFICIENTE');
    expect(merged.menuSkipped).toBe(true);
    expect(merged.summaryMessage).toMatch(/omitido|sin carta/i);
  });

  it('rescata identidad desde IG del lead aunque research diga no encontrado', () => {
    const research = `
No se encontró información verificable sobre un restaurante llamado 'Dani Dragón'.
VEREDICTO: INSUFICIENTE
IDENTIDAD_VERIFICADA: no
MENU_VERIFICADO: no
MOTIVO: Sin presencia digital.
`;
    const merged = mergeAssessmentWithHeuristics(
      {
        verdict: 'INSUFICIENTE',
        reason: 'Sin presencia digital.',
        identityVerified: false,
        menuVerified: false,
        sourcesFound: [],
        blockers: ['identity_not_found'],
      },
      research,
      lead,
    );

    expect(merged.verdict).toBe('SUFICIENTE');
    expect(merged.identityVerified).toBe(true);
    expect(merged.menuSkipped).toBe(true);
  });

  it('parsea el bloque VEREDICTO del texto de investigación', () => {
    const parsed = parseVerdictBlockFromResearch(`
VEREDICTO: INSUFICIENTE
MENU_VERIFICADO: no
IDENTIDAD_VERIFICADA: no
MOTIVO: No hay evidencia pública del local.
`);
    expect(parsed).toEqual({
      verdict: 'INSUFICIENTE',
      menuVerified: false,
      identityVerified: false,
      reason: 'No hay evidencia pública del local.',
    });
  });

  it('arma mensaje de menú omitido', () => {
    const summary = buildResearchAssessmentSummary(
      {
        verdict: 'SUFICIENTE',
        reason: 'IG del lead',
        identityVerified: true,
        menuVerified: false,
        menuSkipped: true,
        sourcesFound: [],
        blockers: ['menu_skipped'],
      },
      lead,
    );

    expect(summary).toMatch(/omitido/i);
  });
});
