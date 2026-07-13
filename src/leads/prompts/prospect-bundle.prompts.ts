import type { Lead } from '@prisma/client';
import {
  isOnlineMenuPlatformUrl,
  normalizeInstagramHandle,
  normalizeWebsiteUrl,
} from '../leads-discovery.helpers';

export function buildProspectResearchPrompt(lead: Lead): string {
  const igHandle = normalizeInstagramHandle(lead.instagram);
  const igUrl = igHandle
    ? `https://www.instagram.com/${igHandle}/`
    : lead.instagram?.trim() || null;
  const websiteUrl = normalizeWebsiteUrl(lead.website);
  const websiteIsMenuPlatform = isOnlineMenuPlatformUrl(websiteUrl);

  const lines = [
    `Investigá en profundidad el restaurante "${lead.businessName}" para armar un paquete comercial Bentoo.`,
    '',
    'Datos conocidos del prospecto:',
    `- Ciudad: ${lead.city ?? 'Buenos Aires, Argentina'}`,
    `- Categoría: ${lead.category ?? 'restaurant'}`,
    websiteUrl ? `- Web (PRIORIDAD #1 — abrir sí o sí): ${websiteUrl}` : null,
    igUrl ? `- Instagram: ${igUrl}${igHandle ? ` (@${igHandle})` : ''}` : null,
    lead.phone ? `- Teléfono: ${lead.phone}` : null,
    lead.email ? `- Email: ${lead.email}` : null,
    lead.whatsapp ? `- WhatsApp: ${lead.whatsapp}` : null,
    lead.discoverySourceUrl
      ? `- Fuente discovery: ${lead.discoverySourceUrl}`
      : null,
    lead.notes ? `- Notas internas: ${lead.notes}` : null,
    '',
    websiteUrl
      ? [
          'FUENTE PRINCIPAL = sitio web del lead:',
          `- Abrí y leé ${websiteUrl} con Google Search / browsing.`,
          websiteIsMenuPlatform
            ? '- Es una carta digital (FU.DO / QueResto / similar): EXTRAÉ categorías, platos y precios tal cual aparecen. MENU_VERIFICADO si hay platos con precio.'
            : '- Extraé menú, horarios, dirección, servicios y textos de marca desde esa URL.',
          '- Si la URL no carga o está vacía, declaralo; no ignores la URL del lead.',
          `- Buscá también: "${lead.businessName}" site:${(() => {
            try {
              return new URL(websiteUrl).hostname;
            } catch {
              return 'fu.do';
            }
          })()}`,
        ].join('\n')
      : null,
    '',
    'Buscá y consolidá información REAL de:',
    '- Menú/carta con precios actuales (web del lead, FU.DO, QueResto, Rappi, PedidosYa, Google Maps)',
    '- Horarios de apertura',
    '- Dirección exacta y barrio',
    '- Rating y cantidad de reviews',
    '- Diferenciadores del local (qué lo hace único)',
    '- Debilidades digitales (sin web propia, solo carta digital, etc.)',
    '- Reviews reales de clientes (3 testimonios si existen)',
    '- Servicios: delivery, take away, reservas, retail',
    '',
    igUrl
      ? [
          'Instagram (complementario):',
          `- Buscá "${lead.businessName}" site:instagram.com y abrí ${igUrl}`,
          '- Extraé lo que Google indexe del perfil/bio/posts.',
          '- NO inventes platos desde fotos sin precio/texto verificable.',
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
    '- Si el lead trae web/carta digital, IDENTIDAD_VERIFICADA: si (salvo 404 evidente).',
    '- Si hay identidad pero NO menú/precios → VEREDICTO: SUFICIENTE y MENU_VERIFICADO: no (demo sin carta).',
    '- Si no confirmás que el local exista (ni web/IG del lead) → IDENTIDAD_VERIFICADA: no e INSUFICIENTE.',
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
  const websiteUrl = normalizeWebsiteUrl(lead.website);
  return [
    'Evaluá si la investigación alcanza para armar una DEMO de Bentoo.',
    '',
    `Lead: ${lead.businessName} · ciudad: ${lead.city ?? 'n/d'} · web: ${websiteUrl ?? 'n/d'} · IG: ${ig ? `@${ig}` : 'n/d'}`,
    '',
    'Investigación:',
    research,
    '',
    'Criterio SUFICIENTE:',
    '- identityVerified=true si existe el local O el lead trae web/IG usable.',
    '- Si el lead tiene website (FU.DO u otra carta) → identityVerified=true salvo evidencia de URL muerta.',
    '- menuVerified=true solo si hay platos con precios reales extraídos.',
    '',
    'Sin carta/precios pero con identidad/web → SUFICIENTE + menuVerified=false.',
    'Si el texto dice que el restaurante no existe / no se encuentra en absoluto Y no hay web del lead → INSUFICIENTE.',
    'blockers: identity_not_found, menu_not_found, website_unreachable, instagram_only_no_menu, name_mismatch.',
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
    lead.website
      ? `Web/carta del lead: ${normalizeWebsiteUrl(lead.website)}`
      : null,
    '',
    'Investigación:',
    research,
    '',
    'Reglas:',
    '- SOLO platos/precios que aparezcan en la investigación o en la web/carta del lead. Prohibido inventar.',
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
    `Product IDs disponibles para destacados: ${productIds.slice(0, 12).join(', ') || '(sin productos — omitir destacados)'}`,
    '',
    'Reglas:',
    '- hero: headline orientado a pedir online / take away si aplica al negocio.',
    '- featuredProducts.productIds: 3-4 IDs reales del menú (o [] si no hay).',
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
