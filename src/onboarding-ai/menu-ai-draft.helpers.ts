import type {
  MenuAiCategoryDraft,
  MenuAiDishDraft,
  MenuAiDraft,
} from './types/menu-ai.types';

export const MENU_AI_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['categories', 'dishes', 'assumptions'],
  properties: {
    categories: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'description'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          name: { type: 'string', minLength: 2, maxLength: 80 },
          description: { type: 'string', minLength: 4, maxLength: 200 },
        },
      },
    },
    dishes: {
      type: 'array',
      minItems: 4,
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'price', 'categoryName'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', minLength: 4, maxLength: 300 },
          price: { type: 'integer', minimum: 100, maximum: 500000 },
          categoryName: { type: 'string', minLength: 2, maxLength: 80 },
        },
      },
    },
    assumptions: {
      type: 'array',
      items: { type: 'string', minLength: 4, maxLength: 200 },
      maxItems: 6,
    },
  },
} as const;

const HEURISTIC_DISH_TEMPLATES = [
  {
    suffix: 'Clásica',
    description: 'Opción tradicional de la casa.',
    basePrice: 6500,
  },
  {
    suffix: 'Especial',
    description: 'Variante recomendada del menú.',
    basePrice: 8200,
  },
  {
    suffix: 'Premium',
    description: 'Ingredientes seleccionados.',
    basePrice: 9800,
  },
];

export function buildHeuristicMenuDishes(
  categories: MenuAiCategoryDraft[],
): MenuAiDishDraft[] {
  const dishes: MenuAiDishDraft[] = [];

  for (const category of categories) {
    HEURISTIC_DISH_TEMPLATES.slice(0, 2).forEach((template, index) => {
      dishes.push({
        name: `${category.name} — ${template.suffix}`,
        description: template.description,
        price: template.basePrice + index * 700,
        categoryName: category.name,
      });
    });
  }

  return dishes.slice(0, 20);
}

export function normalizeMenuDraft(
  draft: Partial<MenuAiDraft> | undefined,
  fallback: MenuAiDraft,
): MenuAiDraft {
  const categories = Array.isArray(draft?.categories)
    ? draft.categories
        .map((category, index) => ({
          id: String(category?.id || `cat-${index + 1}`).trim(),
          name: String(category?.name || '').trim(),
          description: String(category?.description || '').trim(),
        }))
        .filter((category) => category.name.length >= 2)
        .slice(0, 8)
    : fallback.categories;

  const safeCategories =
    categories.length > 0 ? categories : fallback.categories;
  const categoryNames = new Set(
    safeCategories.map((category) => category.name.toLowerCase()),
  );

  const dishes = Array.isArray(draft?.dishes)
    ? draft.dishes
        .map((dish) => ({
          name: String(dish?.name || '').trim(),
          description: String(dish?.description || '').trim(),
          price: Math.round(Number(dish?.price) || 0),
          categoryName: String(dish?.categoryName || '').trim(),
        }))
        .filter(
          (dish) =>
            dish.name.length >= 2 &&
            dish.categoryName.length >= 2 &&
            dish.price >= 100 &&
            categoryNames.has(dish.categoryName.toLowerCase()),
        )
        .slice(0, 24)
    : fallback.dishes;

  const assumptions = Array.isArray(draft?.assumptions)
    ? draft.assumptions
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    : fallback.assumptions;

  return {
    categories: safeCategories,
    dishes: dishes.length > 0 ? dishes : fallback.dishes,
    assumptions,
  };
}

export function buildMenuGeminiPrompt(
  prompt: string,
  restaurantName?: string,
): string {
  return [
    'Genera un borrador de menu para un restaurante en Argentina.',
    'Reglas:',
    '- categories: entre 3 y 6 categorias logicas para el rubro.',
    '- dishes: entre 2 y 4 platos por categoria, con nombres comerciales claros.',
    '- price: precio en pesos argentinos (entero, sin centavos), realista para 2025.',
    '- categoryName debe coincidir exactamente con el name de una categoria.',
    '- descriptions cortas, utiles para carta digital.',
    '- assumptions: supuestos o datos faltantes en espanol.',
    restaurantName ? `- Nombre del local: ${restaurantName}` : '',
    '',
    'Descripcion del usuario:',
    prompt,
  ]
    .filter(Boolean)
    .join('\n');
}
