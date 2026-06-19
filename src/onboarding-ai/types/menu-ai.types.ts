export interface MenuAiCategoryDraft {
  id: string;
  name: string;
  description: string;
}

export interface MenuAiDishDraft {
  name: string;
  description: string;
  /** Precio en pesos ARS (entero). */
  price: number;
  categoryName: string;
}

export interface MenuAiDraft {
  categories: MenuAiCategoryDraft[];
  dishes: MenuAiDishDraft[];
  assumptions: string[];
}
