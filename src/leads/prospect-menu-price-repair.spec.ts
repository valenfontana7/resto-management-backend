import { describe, expect, it } from '@jest/globals';
import { buildTestBundle } from '../prospect-importer/tests/fixtures';
import { validateBundle } from '../prospect-importer/validator';
import { repairInvalidProductPrices } from './prospect-menu-price-repair';

describe('repairInvalidProductPrices', () => {
  it('estima precio 0 con la mediana de la categoría y deja el bundle válido', () => {
    const bundle = buildTestBundle();
    const category = bundle.menu.products[0].category;
    bundle.menu.products[0].price = 10000;
    bundle.menu.products[1].price = 14000;
    bundle.menu.products.push({
      ...bundle.menu.products[0],
      id: 'p-ojo-de-bife-al-malbec',
      name: 'Ojo de bife al Malbec',
      category,
      price: 0,
      imageReference: bundle.menu.products[0].imageReference,
    });

    const warnings = repairInvalidProductPrices(bundle);
    const fixed = bundle.menu.products.find(
      (p) => p.id === 'p-ojo-de-bife-al-malbec',
    );

    expect(fixed?.price).toBe(12000);
    expect(warnings.some((w) => w.includes('p-ojo-de-bife-al-malbec'))).toBe(
      true,
    );
    expect(validateBundle(bundle).errors).toEqual([]);
  });

  it('excluye productos sin precio cuando no hay referencia en el menú', () => {
    const bundle = buildTestBundle();
    bundle.menu.products = [
      {
        ...bundle.menu.products[0],
        id: 'p-bondiola-a-la-cerveza',
        price: 0,
      },
    ];
    bundle.sections.featuredProducts.content.productIds = [
      'p-bondiola-a-la-cerveza',
    ];

    const warnings = repairInvalidProductPrices(bundle);

    expect(bundle.menu.products).toHaveLength(0);
    expect(warnings.some((w) => w.includes('excluido'))).toBe(true);
    expect(bundle.sections.featuredProducts.content.productIds).toEqual([]);
  });
});
