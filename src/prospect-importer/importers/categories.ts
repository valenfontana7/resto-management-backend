import { BundleCategory } from '../types';

export interface MappedCategory {
  id: string;
  name: string;
  description: string;
  order: number;
}

export function mapCategories(categories: BundleCategory[]): MappedCategory[] {
  return [...categories]
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      id: category.id,
      name: category.name.trim(),
      description: category.description?.trim() ?? '',
      order: category.order,
    }));
}
