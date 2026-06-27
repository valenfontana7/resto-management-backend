import { calculateRecipeCost } from './dish-recipe.utils';

describe('calculateRecipeCost', () => {
  it('suma quantity × unitCost', () => {
    expect(
      calculateRecipeCost([
        { quantity: 0.2, unitCost: 5000 },
        { quantity: 2, unitCost: 800 },
      ]),
    ).toBe(2600);
  });

  it('retorna null si falta costo unitario', () => {
    expect(calculateRecipeCost([{ quantity: 1, unitCost: null }])).toBeNull();
  });

  it('retorna null sin líneas', () => {
    expect(calculateRecipeCost([])).toBeNull();
  });
});
