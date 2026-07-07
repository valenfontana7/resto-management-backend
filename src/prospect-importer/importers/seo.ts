import { BundleSeo } from '../types';
import { MappedMedia } from './media';

/**
 * Persiste el bloque SEO con las referencias de media resueltas a URLs
 * (og:image / twitter:image llegan como mediaId en el bundle).
 */
export function mapSeo(
  seo: BundleSeo,
  media: MappedMedia,
): Record<string, unknown> {
  return {
    title: seo.title,
    metaDescription: seo.metaDescription,
    keywords: seo.keywords,
    canonical: seo.canonical ?? null,
    openGraph: resolveImageRefs(seo.openGraph ?? {}, media),
    twitter: resolveImageRefs(seo.twitter ?? {}, media),
    localBusinessSchema: seo.localBusinessSchema ?? null,
    faqSchema: seo.faqSchema ?? [],
  };
}

function resolveImageRefs(block: Record<string, string>, media: MappedMedia) {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(block)) {
    resolved[key] = media.urlById.get(value) ?? value;
  }
  return resolved;
}
