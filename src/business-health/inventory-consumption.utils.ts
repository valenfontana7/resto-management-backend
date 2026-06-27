export interface OrderItemQuantity {
  dishId: string;
  quantity: number;
}

export interface RecipeLineQuantity {
  dishId: string;
  inventoryItemId: string;
  quantity: number;
}

/** Agrupa descuento por insumo según ítems del pedido × líneas de receta. */
export function aggregateRecipeDeductions(
  orderItems: OrderItemQuantity[],
  recipeLines: RecipeLineQuantity[],
): Map<string, number> {
  const qtyByDish = new Map<string, number>();
  for (const item of orderItems) {
    if (!item.dishId || item.quantity <= 0) continue;
    qtyByDish.set(
      item.dishId,
      (qtyByDish.get(item.dishId) ?? 0) + item.quantity,
    );
  }

  const deductByItem = new Map<string, number>();
  for (const line of recipeLines) {
    const orderQty = qtyByDish.get(line.dishId) ?? 0;
    if (orderQty <= 0 || line.quantity <= 0) continue;
    const amount = line.quantity * orderQty;
    deductByItem.set(
      line.inventoryItemId,
      (deductByItem.get(line.inventoryItemId) ?? 0) + amount,
    );
  }

  return deductByItem;
}

export function isAutoDeductOnSaleEnabled(businessRules: unknown): boolean {
  const rules = businessRules as {
    inventory?: { autoDeductOnSale?: boolean };
  } | null;
  return rules?.inventory?.autoDeductOnSale !== false;
}

export function mergeInventorySettings(
  businessRules: unknown,
  patch: { autoDeductOnSale?: boolean },
): Record<string, unknown> {
  const current =
    businessRules && typeof businessRules === 'object'
      ? (businessRules as Record<string, unknown>)
      : {};
  const inventory =
    current.inventory && typeof current.inventory === 'object'
      ? (current.inventory as Record<string, unknown>)
      : {};
  return {
    ...current,
    inventory: { ...inventory, ...patch },
  };
}
