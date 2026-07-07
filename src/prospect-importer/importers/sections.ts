import { BundleSection, ProspectBundle } from '../types';
import { MappedMedia } from './media';
import { asOptionalString } from '../../common/json-coerce';

export interface MappedSection {
  key: string;
  enabled: boolean;
  order: number;
  anchor: string;
  reason?: string;
  content: Record<string, unknown>;
  ctas: Array<{ id: string; label: string; target: string; hierarchy: string }>;
}

export interface MappedTestimonial {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  date: string;
  verified: boolean;
}

const MEDIA_REF_KEYS = ['backgroundImage', 'image', 'logo'] as const;

/**
 * Persiste las secciones con sus referencias de media resueltas a URLs.
 * Además extrae los testimonios al shape del payload demo del frontend.
 */
export function mapSections(
  bundle: ProspectBundle,
  media: MappedMedia,
): {
  sections: MappedSection[];
  testimonials: MappedTestimonial[];
  activeCount: number;
} {
  const sections = Object.entries(bundle.sections)
    .map(([key, section]) => mapSection(key, section, media))
    .sort((a, b) => (a.order || 999) - (b.order || 999));

  return {
    sections,
    testimonials: extractTestimonials(bundle),
    activeCount: sections.filter((s) => s.enabled).length,
  };
}

function mapSection(
  key: string,
  section: BundleSection,
  media: MappedMedia,
): MappedSection {
  const content: Record<string, unknown> = { ...section.content };

  for (const refKey of MEDIA_REF_KEYS) {
    const ref = content[refKey];
    if (typeof ref === 'string' && media.urlById.has(ref)) {
      content[refKey] = media.urlById.get(ref);
    }
  }

  return {
    key,
    enabled: section.enabled,
    order: section.order,
    anchor: section.anchor,
    ...(section.reason ? { reason: section.reason } : {}),
    content,
    ctas: (section.ctas ?? []).map((cta) => ({
      id: cta.id,
      label: cta.label,
      target: cta.target,
      hierarchy: cta.hierarchy ?? 'secondary',
    })),
  };
}

function extractTestimonials(bundle: ProspectBundle): MappedTestimonial[] {
  const section = bundle.sections.testimonials;
  if (!section?.enabled) return [];

  const items =
    (section.content.items as Array<Record<string, unknown>> | undefined) ?? [];

  return items.map((item, index) => ({
    id: asOptionalString(item.id, `testimonial-${index + 1}`),
    customerName: asOptionalString(item.author, 'Cliente'),
    rating: Number(item.rating ?? 5),
    comment: asOptionalString(item.text),
    date: asOptionalString(item.date),
    verified: true,
  }));
}
