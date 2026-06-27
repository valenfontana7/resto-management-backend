export interface RecipeCostLine {
  quantity: number;
  unitCost: number | null;
}

/** Suma quantity × unitCost (centavos). Null si falta costo en algún insumo. */
export function calculateRecipeCost(lines: RecipeCostLine[]): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    if (line.unitCost == null || line.quantity <= 0) return null;
    total += line.quantity * line.unitCost;
  }
  return Math.round(total);
}
