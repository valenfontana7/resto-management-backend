export function parseAiJsonResponse<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Empty AI JSON response');
  }

  let jsonStr = trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      jsonStr = trimmed.slice(start, end + 1);
    }
  }

  return JSON.parse(jsonStr) as T;
}

export function slugifyLeadDemoSlug(businessName: string): string {
  const slug = businessName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);

  return slug || 'prospecto';
}

export function buildLeadDemoUrl(
  frontendUrl: string | undefined,
  businessName: string,
): string {
  const base =
    frontendUrl?.trim().replace(/\/$/, '') || 'https://bentoo.com.ar';
  return `${base}/demo/${slugifyLeadDemoSlug(businessName)}`;
}

export function buildLeadDemoAdminUrl(
  frontendUrl: string | undefined,
  businessName: string,
): string {
  const base =
    frontendUrl?.trim().replace(/\/$/, '') || 'https://bentoo.com.ar';
  return `${base}/demo/admin/${slugifyLeadDemoSlug(businessName)}`;
}

export function deriveLeadDemoAdminUrlFromDemoUrl(demoUrl: string): string {
  const trimmed = demoUrl.trim().replace(/\/$/, '');
  const match = trimmed.match(/^(.*\/demo)\/([^/?#]+)(?:[/?#].*)?$/);
  if (!match) return '';
  return `${match[1]}/admin/${match[2]}`;
}

export type LeadDemoTemplateSlug =
  | 'pizza-artesanal'
  | 'la-parrilla'
  | 'cafe-central'
  | 'burger-lab'
  | 'sushi-express';

export function pickLeadDemoTemplateSlug(hints: {
  category?: string | null;
  businessName?: string | null;
  slug?: string | null;
}): LeadDemoTemplateSlug {
  const text = [hints.category, hints.businessName, hints.slug]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/sushi|japon|japanese/.test(text)) return 'sushi-express';
  if (/pizza|pizzer/.test(text)) return 'pizza-artesanal';
  if (/parrilla|asado|steak|grill/.test(text)) return 'la-parrilla';
  if (/burger|hamburg/.test(text)) return 'burger-lab';
  if (/cafe|cafeter|coffee|bakery|panader|brunch/.test(text)) {
    return 'cafe-central';
  }
  return 'pizza-artesanal';
}
