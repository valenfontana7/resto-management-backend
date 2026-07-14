import type { ProspectBundle } from '../prospect-importer/types';

/**
 * Platos con precio <= 0 rompen validateBundle (error bloqueante).
 * Preferimos estimar con la mediana de la misma categoría; si no hay,
 * mediana global; si tampoco, excluir el producto y avisar.
 */
export function repairInvalidProductPrices(bundle: ProspectBundle): string[] {
  const warnings: string[] = [];
  const products = bundle.menu?.products;
  if (!Array.isArray(products) || products.length === 0) return warnings;

  const priced = products.filter(
    (p) =>
      typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0,
  );

  const byCategory = new Map<string, number[]>();
  for (const p of priced) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p.price);
    byCategory.set(p.category, list);
  }

  const globalMedian = median(priced.map((p) => p.price));
  const kept: typeof products = [];

  for (const product of products) {
    if (
      typeof product.price === 'number' &&
      Number.isFinite(product.price) &&
      product.price > 0
    ) {
      kept.push(product);
      continue;
    }

    const categoryPrices = byCategory.get(product.category) ?? [];
    const estimate = median(categoryPrices) ?? globalMedian;

    if (estimate != null && estimate > 0) {
      const previous = product.price;
      product.price = Math.round(estimate);
      kept.push(product);
      warnings.push(
        `Producto "${product.id}" tenía precio inválido (${previous}); se estimó $${product.price} (mediana de categoría/menú). Confirmar con el dueño.`,
      );
      continue;
    }

    warnings.push(
      `Producto "${product.id}" excluido: precio inválido (${product.price}) y sin referencia para estimar.`,
    );
  }

  bundle.menu.products = kept;

  if (Array.isArray(bundle.sections?.featuredProducts?.content?.productIds)) {
    const valid = new Set(kept.map((p) => p.id));
    const filtered = bundle.sections.featuredProducts.content.productIds.filter(
      (id) => valid.has(String(id)),
    );
    bundle.sections.featuredProducts.content.productIds =
      filtered.length > 0 ? filtered : kept.slice(0, 4).map((p) => p.id);
  }

  return warnings;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
