import {
  normalizeMenuDraft,
  parseMenuAiJsonResponse,
  resolveCategoryName,
} from './menu-ai-draft.helpers';

describe('menu-ai-draft.helpers', () => {
  const fallback = {
    categories: [
      {
        id: 'cat-1',
        name: 'Parrilla clasicas',
        description: 'Cortes tradicionales',
      },
    ],
    dishes: [
      {
        name: 'Parrilla clasicas — Clásica',
        description: 'Opción tradicional de la casa.',
        price: 6500,
        categoryName: 'Parrilla clasicas',
      },
    ],
    assumptions: ['Fallback'],
  };

  it('resolves category names ignoring accents and casing', () => {
    const categories = [
      { id: 'cat-1', name: 'Pizzas clásicas', description: 'Clásicas' },
      { id: 'cat-2', name: 'Bebidas', description: 'Bebidas' },
    ];

    expect(resolveCategoryName('pizzas clasicas', categories)).toBe(
      'Pizzas clásicas',
    );
    expect(resolveCategoryName('Bebidas', categories)).toBe('Bebidas');
  });

  it('keeps Gemini dishes when categoryName only differs by accents', () => {
    const draft = normalizeMenuDraft(
      {
        categories: [
          { id: 'cat-1', name: 'Pizzas clásicas', description: 'Clásicas' },
        ],
        dishes: [
          {
            name: 'Muzzarella',
            description: 'Salsa y muzza',
            price: 9000,
            categoryName: 'Pizzas clasicas',
          },
        ],
        assumptions: [],
      },
      fallback,
    );

    expect(draft.dishes).toHaveLength(1);
    expect(draft.dishes[0]?.name).toBe('Muzzarella');
    expect(draft.dishes[0]?.categoryName).toBe('Pizzas clásicas');
  });

  it('parses fenced JSON responses from Gemini', () => {
    const parsed = parseMenuAiJsonResponse(
      '```json\n{"categories":[],"dishes":[],"assumptions":[]}\n```',
    );

    expect(parsed).toEqual({
      categories: [],
      dishes: [],
      assumptions: [],
    });
  });
});
