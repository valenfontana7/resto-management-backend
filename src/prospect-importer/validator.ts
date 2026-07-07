import { BundleCta, DAY_KEYS, ProspectBundle, ValidationResult } from './types';

const COLOR_REGEX =
  /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([\d\s.,%]+\))$/;

const THEME_TOKEN_SETS: Record<string, string[]> = {
  borderRadius: ['none', 'sm', 'md', 'lg', 'xl', 'full'],
  spacing: ['compact', 'comfortable', 'spacious'],
  shadows: ['none', 'soft', 'strong'],
  cardStyle: ['flat', 'elevated', 'outlined'],
  buttonStyle: ['rounded-solid', 'rounded-outline', 'pill', 'square'],
  sectionSpacing: ['sm', 'md', 'lg', 'xl'],
  animationStyle: ['none', 'subtle-fade', 'slide'],
  layoutDensity: ['compact', 'balanced', 'airy'],
  menuLayout: ['grid', 'list'],
  categoryDisplay: ['tabs', 'list', 'accordion'],
  maxWidth: ['md', 'lg', 'xl', 'full'],
};

/**
 * Valida schema y consistencia referencial del bundle.
 * `errors` bloquea el import; `warnings` se propagan al reporte.
 */
export function validateBundle(bundle: ProspectBundle): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  validateIdentifiers(bundle, errors);
  validateBusiness(bundle, errors, warnings);
  validateMenu(bundle, errors, warnings);
  validateMedia(bundle, errors);
  validateSections(bundle, errors, warnings);
  validateCtas(bundle, errors);
  validateNavigation(bundle, errors);
  validateThemeAndColors(bundle, errors);
  validateSocial(bundle, warnings);

  return { errors, warnings };
}

function validateIdentifiers(bundle: ProspectBundle, errors: string[]) {
  if (!bundle.prospect?.id?.trim()) errors.push('prospect.id es requerido.');
  if (!bundle.prospect?.businessName?.trim())
    errors.push('prospect.businessName es requerido.');
  if (!bundle.prospect?.city?.trim())
    errors.push('prospect.city es requerido.');

  const ids = [
    ...(bundle.menu?.categories ?? []).map((c) => c.id),
    ...(bundle.menu?.products ?? []).map((p) => p.id),
    ...(bundle.media?.images ?? []).map((m) => m.id),
  ];

  const seen = new Set<string>();
  for (const id of ids) {
    if (!id?.trim()) {
      errors.push('Se encontró un identificador vacío en menu/media.');
      continue;
    }
    if (seen.has(id)) errors.push(`ID duplicado: "${id}".`);
    seen.add(id);
  }
}

function validateBusiness(
  bundle: ProspectBundle,
  errors: string[],
  warnings: string[],
) {
  if (!bundle.business?.description?.trim())
    errors.push('business.description es requerido.');
  if (!bundle.business?.cuisine?.length)
    errors.push('business.cuisine no puede estar vacío.');

  const hours = bundle.business?.openingHours;
  if (!hours) {
    errors.push('business.openingHours es requerido.');
    return;
  }

  for (const day of DAY_KEYS) {
    const ranges = hours[day];
    if (ranges === undefined) {
      errors.push(`business.openingHours.${day} falta (usar [] para cerrado).`);
      continue;
    }
    for (const range of ranges) {
      if (
        !/^\d{2}:\d{2}$/.test(range.open) ||
        !/^\d{2}:\d{2}$/.test(range.close)
      ) {
        errors.push(`Horario inválido en ${day}: ${JSON.stringify(range)}.`);
      }
    }
  }

  if (!bundle.prospect.neighborhood?.trim()) {
    warnings.push(
      'prospect.neighborhood no informado; el demo se mostrará sin barrio.',
    );
  }
}

function validateMenu(
  bundle: ProspectBundle,
  errors: string[],
  warnings: string[],
) {
  const categories = bundle.menu?.categories ?? [];
  const products = bundle.menu?.products ?? [];

  if (!categories.length) errors.push('menu.categories no puede estar vacío.');
  if (!products.length) errors.push('menu.products no puede estar vacío.');

  const categoryIds = new Set(categories.map((c) => c.id));
  const mediaIds = new Set((bundle.media?.images ?? []).map((m) => m.id));
  const usedCategories = new Set<string>();

  for (const product of products) {
    if (!categoryIds.has(product.category)) {
      errors.push(
        `Producto "${product.id}" referencia categoría inexistente "${product.category}".`,
      );
    }
    usedCategories.add(product.category);

    if (!product.imageReference) {
      errors.push(`Producto "${product.id}" no define imageReference.`);
    } else if (!mediaIds.has(product.imageReference)) {
      errors.push(
        `Producto "${product.id}" referencia imagen inexistente "${product.imageReference}".`,
      );
    }

    if (typeof product.price !== 'number' || product.price <= 0) {
      errors.push(
        `Producto "${product.id}" tiene precio inválido (${product.price}).`,
      );
    }
  }

  for (const category of categories) {
    if (!usedCategories.has(category.id)) {
      warnings.push(`Categoría "${category.id}" no tiene productos.`);
    }
  }
}

function validateMedia(bundle: ProspectBundle, errors: string[]) {
  if (!bundle.media?.basePath) errors.push('media.basePath es requerido.');

  for (const image of bundle.media?.images ?? []) {
    if (!image.filename?.trim())
      errors.push(`Imagen "${image.id}" sin filename.`);
    if (!['REAL', 'GENERATED', 'PLACEHOLDER'].includes(image.source)) {
      errors.push(
        `Imagen "${image.id}" con source inválido "${image.source}".`,
      );
    }
    if (image.source === 'GENERATED' && !image.prompt) {
      errors.push(
        `Imagen generada "${image.id}" debe incluir prompt de regeneración.`,
      );
    }
  }
}

function validateSections(
  bundle: ProspectBundle,
  errors: string[],
  warnings: string[],
) {
  const mediaIds = new Set((bundle.media?.images ?? []).map((m) => m.id));
  const productIds = new Set((bundle.menu?.products ?? []).map((p) => p.id));
  const sections = bundle.sections ?? {};

  if (!Object.values(sections).some((s) => s.enabled)) {
    errors.push('El bundle no tiene ninguna sección habilitada.');
  }

  for (const [name, section] of Object.entries(sections)) {
    if (!section.enabled) {
      if (!section.reason)
        warnings.push(
          `Sección deshabilitada "${name}" sin reason documentada.`,
        );
      continue;
    }

    if (!section.anchor?.trim()) errors.push(`Sección "${name}" sin anchor.`);

    for (const key of ['backgroundImage', 'image', 'logo'] as const) {
      const ref = section.content?.[key];
      if (typeof ref === 'string' && !mediaIds.has(ref)) {
        errors.push(
          `Sección "${name}" referencia media inexistente "${ref}" (${key}).`,
        );
      }
    }

    const refs = section.content?.productIds;
    if (Array.isArray(refs)) {
      for (const pid of refs) {
        if (!productIds.has(pid as string)) {
          errors.push(
            `Sección "${name}" referencia producto inexistente "${pid}".`,
          );
        }
      }
    }
  }
}

function collectCtas(
  bundle: ProspectBundle,
): Array<{ owner: string; cta: BundleCta }> {
  const all: Array<{ owner: string; cta: BundleCta }> = [];
  for (const [name, section] of Object.entries(bundle.sections ?? {})) {
    if (!section.enabled) continue;
    for (const cta of section.ctas ?? [])
      all.push({ owner: `sección ${name}`, cta });
  }
  return all;
}

function validateCtaTarget(
  owner: string,
  target: string,
  anchors: Set<string>,
  routes: Set<string>,
  errors: string[],
) {
  const [kind, value] = target.split(':');
  if (kind === 'anchor') {
    if (!anchors.has(value))
      errors.push(`${owner}: CTA apunta a anchor inexistente "${value}".`);
  } else if (kind === 'route') {
    if (!routes.has(value))
      errors.push(`${owner}: CTA apunta a ruta no declarada "${value}".`);
  } else {
    errors.push(
      `${owner}: target de CTA inválido "${target}" (usar anchor:<x> o route:<x>).`,
    );
  }
}

function validateCtas(bundle: ProspectBundle, errors: string[]) {
  const anchors = new Set(
    Object.values(bundle.sections ?? {})
      .filter((s) => s.enabled)
      .map((s) => s.anchor),
  );
  const routes = new Set((bundle.builder?.routes ?? []).map((r) => r.path));

  for (const { owner, cta } of collectCtas(bundle)) {
    validateCtaTarget(owner, cta.target, anchors, routes, errors);
  }

  for (const anchor of bundle.builder?.homepageSectionOrder ?? []) {
    if (!anchors.has(anchor)) {
      errors.push(
        `builder.homepageSectionOrder referencia sección no habilitada "${anchor}".`,
      );
    }
  }
}

function validateNavigation(bundle: ProspectBundle, errors: string[]) {
  const nav = bundle.builder?.navigation;
  if (!nav?.items?.length) {
    errors.push('builder.navigation.items no puede estar vacío.');
    return;
  }

  const anchors = new Set(
    Object.values(bundle.sections ?? {})
      .filter((s) => s.enabled)
      .map((s) => s.anchor),
  );
  const routes = new Set((bundle.builder?.routes ?? []).map((r) => r.path));

  for (const item of nav.items) {
    if (!item.label?.trim()) errors.push('Ítem de navegación sin label.');
    validateCtaTarget(
      `navegación "${item.label}"`,
      item.target,
      anchors,
      routes,
      errors,
    );
  }

  if (nav.ctaButton) {
    validateCtaTarget(
      'navegación CTA',
      nav.ctaButton.target,
      anchors,
      routes,
      errors,
    );
  }
}

function validateThemeAndColors(bundle: ProspectBundle, errors: string[]) {
  for (const [token, allowed] of Object.entries(THEME_TOKEN_SETS)) {
    const value = (bundle.theme as Record<string, unknown>)?.[token];
    if (
      value !== undefined &&
      typeof value === 'string' &&
      !allowed.includes(value)
    ) {
      errors.push(
        `Token de theme inválido: ${token}="${value}" (permitidos: ${allowed.join(', ')}).`,
      );
    }
  }

  for (const [name, color] of Object.entries(
    bundle.branding?.colorPalette ?? {},
  )) {
    if (!COLOR_REGEX.test(color)) {
      errors.push(
        `Color inválido en branding.colorPalette.${name}: "${color}".`,
      );
    }
  }

  const palette = new Set(Object.values(bundle.branding?.colorPalette ?? {}));
  for (const [token, color] of Object.entries(
    bundle.builder?.colorTokens ?? {},
  )) {
    if (!palette.has(color)) {
      errors.push(
        `builder.colorTokens.${token} ("${color}") no existe en branding.colorPalette.`,
      );
    }
  }

  if (
    !bundle.branding?.typography?.headingFont ||
    !bundle.branding?.typography?.bodyFont
  ) {
    errors.push('branding.typography debe definir headingFont y bodyFont.');
  }
}

function validateSocial(bundle: ProspectBundle, warnings: string[]) {
  for (const [network, entry] of Object.entries(bundle.social ?? {})) {
    if (!entry) continue;
    if (entry.status === 'invented-placeholder') {
      warnings.push(
        `social.${network} es un placeholder inventado (confidence 0): confirmar antes de presentar.`,
      );
    }
  }
}
