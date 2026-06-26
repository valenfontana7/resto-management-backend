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

export function normalizeMenuKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function resolveCategoryName(
  categoryName: string,
  categories: MenuAiCategoryDraft[],
): string | null {
  const key = normalizeMenuKey(categoryName);
  if (!key) return null;

  const exact = categories.find(
    (category) => normalizeMenuKey(category.name) === key,
  );
  if (exact) return exact.name;

  const partial = categories.find((category) => {
    const categoryKey = normalizeMenuKey(category.name);
    return categoryKey.includes(key) || key.includes(categoryKey);
  });

  return partial?.name ?? null;
}

export function parseMenuAiJsonResponse(raw: string): Partial<MenuAiDraft> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Empty Gemini menu draft response');
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

  return JSON.parse(jsonStr) as Partial<MenuAiDraft>;
}

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

  const dishes = Array.isArray(draft?.dishes)
    ? draft.dishes
        .map((dish) => {
          const name = String(dish?.name || '').trim();
          const description = String(dish?.description || '').trim();
          const price = Math.round(Number(dish?.price) || 0);
          const resolvedCategoryName = resolveCategoryName(
            String(dish?.categoryName || '').trim(),
            safeCategories,
          );

          if (name.length < 2 || !resolvedCategoryName || price < 100) {
            return null;
          }

          return {
            name,
            description,
            price,
            categoryName: resolvedCategoryName,
          };
        })
        .filter((dish): dish is MenuAiDishDraft => dish !== null)
        .slice(0, 24)
    : [];

  const assumptions = Array.isArray(draft?.assumptions)
    ? draft.assumptions
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    : fallback.assumptions;

  const heuristicDishes = buildHeuristicMenuDishes(safeCategories);

  return {
    categories: safeCategories,
    dishes:
      dishes.length > 0
        ? dishes
        : heuristicDishes.length > 0
          ? heuristicDishes
          : fallback.dishes,
    assumptions,
  };
}

export function buildMenuGeminiPrompt(
  prompt: string,
  restaurantName?: string,
): string {
  const trimmedPrompt = prompt.trim();
  return [
    'Pedido del usuario (OBLIGATORIO: basar todo el menu en este texto):',
    '---',
    trimmedPrompt,
    '---',
    restaurantName ? `Nombre del local: ${restaurantName}` : '',
    '',
    'Genera un borrador de menu para un restaurante en Argentina.',
    'Reglas:',
    '- Usa SOLO el rubro, platos, estilo y rangos de precio mencionados por el usuario.',
    '- No inventes un menu generico de parrilla/pizza si el usuario describe otro negocio.',
    '- categories: entre 3 y 6 categorias logicas para ESE rubro.',
    '- dishes: entre 2 y 4 platos por categoria, con nombres comerciales concretos del pedido.',
    '- price: precio en pesos argentinos (entero, sin centavos), realista para 2025.',
    '- categoryName debe coincidir exactamente con el name de una categoria.',
    '- descriptions cortas, utiles para carta digital.',
    '- assumptions: supuestos o datos faltantes en espanol.',
  ]
    .filter(Boolean)
    .join('\n');
}
