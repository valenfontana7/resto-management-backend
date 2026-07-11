type AllocItem = { id: string; subtotal: number };

/** Port de salon-equal-split-allocator (frontend) para golden flows E2E. */
export function selectItemsForEqualSplitShare(
  unpaidItems: AllocItem[],
  targetSubtotal: number,
  takeRemainder: boolean,
): string[] {
  if (unpaidItems.length === 0) return [];

  if (takeRemainder || unpaidItems.length === 1) {
    return unpaidItems.map((item) => item.id);
  }

  if (targetSubtotal <= 0) {
    return [unpaidItems[0].id];
  }

  let bestIds: string[] = [];
  let bestDiff = Number.POSITIVE_INFINITY;

  const tryCandidate = (candidateIds: string[]) => {
    if (candidateIds.length === 0) return;
    const sum = sumSubtotals(unpaidItems, candidateIds);
    const diff = Math.abs(sum - targetSubtotal);
    if (diff >= bestDiff) return;
    bestDiff = diff;
    bestIds = candidateIds;
  };

  tryCandidate(greedyLargestFirst(unpaidItems, targetSubtotal));
  tryCandidate(greedySmallestFirst(unpaidItems, targetSubtotal));

  for (const item of unpaidItems) {
    tryCandidate([item.id]);
  }

  return bestIds.length > 0 ? bestIds : [unpaidItems[0].id];
}

export function resolveEqualSplitItemIdsForStep(
  unpaidItems: AllocItem[],
  parts: number,
  step: number,
): string[] {
  const partsLeft = parts - step + 1;
  const isLast = partsLeft <= 1;

  if (isLast) {
    return unpaidItems.map((item) => item.id);
  }

  const targetSubtotal =
    unpaidItems.reduce((sum, item) => sum + item.subtotal, 0) / partsLeft;

  return selectItemsForEqualSplitShare(unpaidItems, targetSubtotal, false);
}

function sumSubtotals(unpaidItems: AllocItem[], ids: string[]): number {
  const set = new Set(ids);
  return unpaidItems
    .filter((item) => set.has(item.id))
    .reduce((sum, item) => sum + item.subtotal, 0);
}

function greedyLargestFirst(
  unpaidItems: AllocItem[],
  targetSubtotal: number,
): string[] {
  const ids: string[] = [];
  let sum = 0;

  for (const item of [...unpaidItems].sort((a, b) => b.subtotal - a.subtotal)) {
    if (sum >= targetSubtotal) break;
    ids.push(item.id);
    sum += item.subtotal;
  }

  return ids;
}

function greedySmallestFirst(
  unpaidItems: AllocItem[],
  targetSubtotal: number,
): string[] {
  const ids: string[] = [];
  let sum = 0;

  for (const item of [...unpaidItems].sort((a, b) => a.subtotal - b.subtotal)) {
    if (sum >= targetSubtotal) break;
    ids.push(item.id);
    sum += item.subtotal;
  }

  return ids;
}
