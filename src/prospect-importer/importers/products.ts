import { BundleProduct } from '../types';
import { MappedMedia } from './media';

/** Badges que marcan un plato como destacado en el demo. */
const FEATURED_BADGES = new Set([
  'best-seller',
  'popular',
  'recomendado',
  'especialidad',
]);

export interface MappedDish {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  isFeatured: boolean;
  ingredients: string[];
  allergens: string[];
  /** Metadata extra del bundle preservada para el editor. */
  dietaryTags: string[];
  spicyLevel: number;
  badges: string[];
}

export function mapProduct(
  product: BundleProduct,
  media: MappedMedia,
): MappedDish {
  const image = media.urlById.get(product.imageReference);
  if (!image) {
    // El validator ya rechaza esto; defensa ante uso directo del mapper.
    throw new Error(
      `Producto "${product.id}" referencia imagen inexistente "${product.imageReference}".`,
    );
  }

  return {
    id: product.id,
    name: product.name.trim(),
    description: product.description.trim(),
    price: product.price,
    image,
    isFeatured:
      (product.badges ?? []).some((badge) => FEATURED_BADGES.has(badge)) ||
      (product.popularity ?? 0) >= 0.9,
    ingredients: product.ingredients ?? [],
    allergens: product.allergens ?? [],
    dietaryTags: product.dietaryTags ?? [],
    spicyLevel: product.spicyLevel ?? 0,
    badges: product.badges ?? [],
  };
}
