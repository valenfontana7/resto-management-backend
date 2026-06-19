export type DishChannelPricing = {
  price: number;
  salonPrice: number | null;
  isAvailableInSalon: boolean;
};

/** Precio unitario efectivo para operación de salón (cuenta / comanda). */
export function resolveSalonUnitPrice(dish: DishChannelPricing): number {
  return dish.salonPrice ?? dish.price;
}

export function isSalonSellable(dish: DishChannelPricing): boolean {
  return dish.isAvailableInSalon;
}
