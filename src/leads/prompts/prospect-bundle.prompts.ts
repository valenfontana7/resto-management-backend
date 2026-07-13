import type { Lead } from '@prisma/client';

export function buildProspectResearchPrompt(lead: Lead): string {
  const lines = [
    `Investigá en profundidad el restaurante "${lead.businessName}" para armar un paquete comercial Bentoo.`,
    '',
    'Datos conocidos del prospecto:',
    `- Ciudad: ${lead.city ?? 'Buenos Aires, Argentina'}`,
    `- Categoría: ${lead.category ?? 'restaurant'}`,
    lead.website ? `- Web: ${lead.website}` : null,
    lead.instagram ? `- Instagram: ${lead.instagram}` : null,
    lead.phone ? `- Teléfono: ${lead.phone}` : null,
    lead.email ? `- Email: ${lead.email}` : null,
    lead.whatsapp ? `- WhatsApp: ${lead.whatsapp}` : null,
    lead.discoverySourceUrl
      ? `- Fuente discovery: ${lead.discoverySourceUrl}`
      : null,
    lead.notes ? `- Notas internas: ${lead.notes}` : null,
    '',
    'Buscá y consolidá información REAL de:',
    '- Menú/carta con precios actuales (QueResto, Rappi, PedidosYa, web propia, Google)',
    '- Horarios de apertura',
    '- Dirección exacta y barrio',
    '- Rating y cantidad de reviews',
    '- Diferenciadores del local (qué lo hace único)',
    '- Debilidades digitales (sin web, solo apps, etc.)',
    '- Reviews reales de clientes (3 testimonios si existen)',
    '- Servicios: delivery, take away, reservas, retail',
    '',
    'Respondé en texto estructurado (no JSON) con secciones claras:',
    'IDENTIDAD, UBICACIÓN, CONCEPTO, HORARIOS, SERVICIOS, CARTA Y PRECIOS, REVIEWS, DIGITAL, OPORTUNIDADES COMERCIALES, URLs ENCONTRADAS.',
    '',
    'Reglas:',
    '- No inventes platos ni precios: si no encontrás menú, listá solo lo que sí verificaste.',
    '- Precios en ARS enteros.',
    '- Español rioplatense.',
  ].filter(Boolean);

  return lines.join('\n');
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
    '- Mínimo 8 productos con precio numérico > 0 en ARS.',
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
