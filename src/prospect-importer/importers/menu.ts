import { BundleMenu } from '../types';
import { mapCategories, MappedCategory } from './categories';
import { mapProduct, MappedDish } from './products';
import { MappedMedia } from './media';

export interface MappedMenuCategory extends MappedCategory {
  dishes: MappedDish[];
}

/**
 * Compone categorías + productos en el formato de menú demo del frontend
 * (`DemoMenuCategoryDef[]` en resto-management-system).
 */
export function mapMenu(
  menu: BundleMenu,
  media: MappedMedia,
): MappedMenuCategory[] {
  const categories = mapCategories(menu.categories);

  return categories.map((category) => ({
    ...category,
    dishes: menu.products
      .filter((product) => product.category === category.id)
      .map((product) => mapProduct(product, media)),
  }));
}
