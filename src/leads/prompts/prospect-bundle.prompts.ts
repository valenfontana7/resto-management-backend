import type { Lead } from '@prisma/client';
import { normalizeInstagramHandle } from '../leads-discovery.helpers';

export function buildProspectResearchPrompt(lead: Lead): string {
  const igHandle = normalizeInstagramHandle(lead.instagram);
  const igUrl = igHandle
    ? `https://www.instagram.com/${igHandle}/`
    : lead.instagram?.trim() || null;

  const lines = [
    `Investigá en profundidad el restaurante "${lead.businessName}" para armar un paquete comercial Bentoo.`,
    '',
    'Datos conocidos del prospecto:',
    `- Ciudad: ${lead.city ?? 'Buenos Aires, Argentina'}`,
    `- Categoría: ${lead.category ?? 'restaurant'}`,
    lead.website ? `- Web: ${lead.website}` : null,
    igUrl ? `- Instagram: ${igUrl}${igHandle ? ` (@${igHandle})` : ''}` : null,
    lead.phone ? `- Teléfono: ${lead.phone}` : null,
    lead.email ? `- Email: ${lead.email}` : null,
    lead.whatsapp ? `- WhatsApp: ${lead.whatsapp}` : null,
    lead.discoverySourceUrl
      ? `- Fuente discovery: ${lead.discoverySourceUrl}`
      : null,
    lead.notes ? `- Notas internas: ${lead.notes}` : null,
    '',
    'Buscá y consolidá información REAL de:',
    '- Menú/carta con precios actuales (QueResto, Rappi, PedidosYa, web propia, Google Maps, posts indexados)',
    '- Horarios de apertura',
    '- Dirección exacta y barrio',
    '- Rating y cantidad de reviews',
    '- Diferenciadores del local (qué lo hace único)',
    '- Debilidades digitales (sin web, solo Instagram, etc.)',
    '- Reviews reales de clientes (3 testimonios si existen)',
    '- Servicios: delivery, take away, reservas, retail',
    '',
    igUrl
      ? [
          'Instagram (prioridad porque es la fuente declarada del lead):',
          `- Buscá "${lead.businessName}" site:instagram.com y abrí ${igUrl}`,
          '- Extraé lo que Google indexe del perfil/bio/posts (tipo de comida, ubicación, highlights de carta).',
          '- NO inventes platos desde fotos sin precio/texto verificable.',
          '- Si Instagram existe pero no hay carta/precios públicos indexados, declaralo explícitamente.',
        ].join('\n')
      : null,
    '',
    'Respondé en texto estructurado (no JSON) con secciones claras:',
    'IDENTIDAD, UBICACIÓN, CONCEPTO, HORARIOS, SERVICIOS, CARTA Y PRECIOS, REVIEWS, DIGITAL, OPORTUNIDADES COMERCIALES, URLs ENCONTRADAS.',
    '',
    'Cerrá SIEMPRE con este bloque exacto:',
    'VEREDICTO: SUFICIENTE | INSUFICIENTE',
    'MENU_VERIFICADO: si | no',
    'IDENTIDAD_VERIFICADA: si | no',
    'MOTIVO: <una frase>',
    '',
    'Reglas duras:',
    '- No inventes platos, precios, dirección ni reviews.',
    '- Si hay identidad (Maps/web/IG) pero NO menú/precios → VEREDICTO: SUFICIENTE y MENU_VERIFICADO: no (demo sin carta).',
    '- Si no confirmás que el local exista (ni con IG/web del lead) → IDENTIDAD_VERIFICADA: no e INSUFICIENTE.',
    '- Precios en ARS enteros solo si los encontraste.',
    '- Español rioplatense.',
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildProspectResearchAssessmentPrompt(
  lead: Lead,
  research: string,
): string {
  const ig = normalizeInstagramHandle(lead.instagram);
  return [
    'Evaluá si la investigación alcanza para armar una DEMO Fiel de Bentoo (menú real + identidad real).',
    '',
    `Lead: ${lead.businessName} · ciudad: ${lead.city ?? 'n/d'} · IG: ${ig ? `@${ig}` : 'n/d'}`,
    '',
    'Investigación:',
    research,
    '',
    'Criterio SUFICIENTE:',
    '- identityVerified=true: se confirma que el local existe (Google/Maps/web/IG/directorio) o hay señal fuerte de perfil real.',
    '- menuVerified=true: hay platos con precios reales o carta verificable.',
    '',
    'Sin carta/precios pero con identidad → SUFICIENTE + menuVerified=false (demo sin menú).',
    'Si solo hay Instagram sin carta → SUFICIENTE + menuVerified=false (no scrapamos Instagram).',
    'Si el texto dice que el restaurante no existe / no se encuentra en absoluto → INSUFICIENTE.',
    'blockers: códigos cortos p.ej. identity_not_found, menu_not_found, instagram_only_no_menu, name_mismatch.',
  ].join('\n');
}

export function buildProspectBusinessStructurePrompt(
  lead: Lead,
  research: string,
): string {
  return [
    'Convertí la investigación comercial en un bloque JSON estricto para Bentoo.',
    '',
    `Prospecto CRM: ${lead.businessName} (leadId: ${lead.id})`,
    '',
    'Investigación:',
    research,
    '',
    'Reglas:',
    '- social.* debe usar { value, confidence, source[] } por red.',
    '- Si no hay email verificado, omitir o marcar confidence 0.',
    '- openingHours: usar [] para días cerrados; formato HH:MM.',
    '- cuisine: array con al menos 1 tipo de cocina real (nunca []).',
    '- businessIntelligence: strengths, weaknesses, commercialOpportunities, salesObservations (arrays).',
    '- colorPalette: colores hex válidos acordes al tipo de cocina.',
    '- Solo datos presentes en la investigación; no inventes.',
  ].join('\n');
}

export function buildProspectMenuStructurePrompt(
  lead: Lead,
  research: string,
  categoryIds?: string[],
): string {
  return [
    'Extraé el menú REAL del restaurante como JSON estricto.',
    '',
    `Restaurante: ${lead.businessName}`,
    '',
    'Investigación:',
    research,
    '',
    'Reglas:',
    '- SOLO platos/precios que aparezcan en la investigación. Prohibido inventar.',
    '- Mínimo 8 productos con precio numérico > 0 en ARS (si la investigación no los tiene, este paso no debería haberse ejecutado).',
    '- Mínimo 3 categorías con id kebab-case (cat-xxx).',
    '- Product id: p-{slug} únicos.',
    '- Incluí platos estrella, bebidas si están en la carta.',
    '- confidence por producto (0-1) según fuente.',
    categoryIds?.length
      ? `- Usá estas categorías si aplican: ${categoryIds.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildProspectContentStructurePrompt(
  lead: Lead,
  research: string,
  productIds: string[],
): string {
  return [
    'Generá copy comercial y SEO para la demo del restaurante.',
    '',
    `Restaurante: ${lead.businessName}`,
    '',
    'Investigación:',
    research,
    '',
    `Product IDs disponibles para destacados: ${productIds.slice(0, 12).join(', ')}`,
    '',
    'Reglas:',
    '- hero: headline orientado a pedir online / take away si aplica al negocio.',
    '- featuredProducts.productIds: 3-4 IDs reales del menú.',
    '- testimonials: solo reviews reales encontradas; si no hay, array vacío.',
    '- faq: 4-5 preguntas útiles para clientes nuevos.',
    '- seo: title ≤ 70 chars, metaDescription ≤ 160 chars, keywords locales.',
    '- No inventes hechos que no estén en la investigación.',
  ].join('\n');
}

export function buildProspectRepairPrompt(
  errors: string[],
  partialJson: string,
): string {
  return [
    'Corregí este prospect bundle JSON para que pase validación Bentoo.',
    '',
    'Errores:',
    ...errors.map((e) => `- ${e}`),
    '',
    'Bundle parcial:',
    partialJson,
    '',
    'Devolvé SOLO el JSON corregido completo (schemaVersion 1.0).',
  ].join('\n');
}
