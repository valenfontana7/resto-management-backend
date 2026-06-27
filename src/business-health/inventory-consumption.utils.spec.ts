import { describe, expect, it } from '@jest/globals';
import {
  aggregateRecipeDeductions,
  isAutoDeductOnSaleEnabled,
} from './inventory-consumption.utils';

describe('inventory-consumption.utils', () => {
  it('agrupa descuento por insumo', () => {
    const map = aggregateRecipeDeductions(
      [
        { dishId: 'd1', quantity: 2 },
        { dishId: 'd2', quantity: 1 },
      ],
      [
        { dishId: 'd1', inventoryItemId: 'i1', quantity: 0.2 },
        { dishId: 'd2', inventoryItemId: 'i1', quantity: 0.1 },
        { dishId: 'd1', inventoryItemId: 'i2', quantity: 1 },
      ],
    );

    expect(map.get('i1')).toBeCloseTo(0.5);
    expect(map.get('i2')).toBe(2);
  });

  it('autoDeductOnSale activo por defecto', () => {
    expect(isAutoDeductOnSaleEnabled(null)).toBe(true);
    expect(
      isAutoDeductOnSaleEnabled({ inventory: { autoDeductOnSale: false } }),
    ).toBe(false);
  });
});
