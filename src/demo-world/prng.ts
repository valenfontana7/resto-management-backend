/**
 * Deterministic PRNG (mulberry32) for reproducible demo worlds.
 */

export function hashSeed(input: string | number): number {
  if (typeof input === 'number') return input >>> 0;
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createPrng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickIndex(rand: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let roll = rand() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

export function pickOne<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

export function chance(rand: () => number, p: number): boolean {
  return rand() < p;
}

export function intBetween(
  rand: () => number,
  min: number,
  max: number,
): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
