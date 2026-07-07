import { MappedImport, ProspectBundle } from './types';
import { mapBranding } from './importers/branding';
import { mapMedia } from './importers/media';
import { mapMenu } from './importers/menu';
import { mapNavigation } from './importers/navigation';
import { mapRestaurant } from './importers/restaurant';
import { mapSections } from './importers/sections';
import { mapSeo } from './importers/seo';
import { mapSettings } from './importers/settings';
import { mapTheme } from './importers/theme';

/**
 * Transforma el bundle (formato de intercambio) al modelo interno de Bentoo:
 * un registro DemoExample + payload demo. El bundle NUNCA se persiste tal cual.
 */
export function mapBundle(bundle: ProspectBundle): MappedImport {
  const warnings: string[] = [];

  const slug = normalizeSlug(
    bundle.builder.bentooImport?.demoSlug || bundle.prospect.businessName,
  );

  const media = mapMedia(bundle.media);
  const theme = mapTheme(bundle.theme);
  const identity = mapRestaurant(bundle, slug, media, warnings);
  const branding = mapBranding(bundle.branding, theme, media);
  const menu = mapMenu(bundle.menu, media);
  const { sections, testimonials, activeCount } = mapSections(bundle, media);
  const seo = mapSeo(bundle.seo, media);
  const navigation = mapNavigation(bundle.builder);
  const settings = mapSettings(bundle);

  const isPublic =
    (bundle.builder.bentooImport?.visibility ?? 'private-lead') !==
    'private-lead';
  const leadId = bundle.prospect.leadId ?? null;

  const payload: Record<string, unknown> = {
    ...identity,
    features: settings.features,
    testimonials,
    branding,
    menu,
    sections,
    seo,
    navigation,
    settings,
    media: media.manifest,
    prospect: {
      id: bundle.prospect.id,
      sources: bundle.prospect.sources,
      researchedUrls: bundle.prospect.researchedUrls,
      generatedAt: bundle.generatedAt,
      schemaVersion: bundle.schemaVersion,
    },
    ...(leadId ? { leadId } : {}),
  };

  return {
    record: {
      slug,
      name: identity.name,
      type: identity.type,
      cuisine: identity.cuisine,
      city: identity.location.city,
      neighborhood: identity.location.neighborhood,
      isPublic,
      leadId,
      isActive: true,
      isFeatured: false,
      // Las demos privadas de leads viven en el rango >= 9000 (convención Bentoo).
      sortOrder: isPublic ? 0 : 9010,
    },
    payload,
    counts: {
      products: bundle.menu.products.length,
      categories: bundle.menu.categories.length,
      sectionsActive: activeCount,
      images: media.manifest.length,
      seoCompleted: Boolean(bundle.seo?.title && bundle.seo?.metaDescription),
    },
    warnings,
  };
}

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
