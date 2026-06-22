export function compareSemver(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const parse = (value: string | null | undefined) =>
    (value ?? '')
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part.replace(/[^0-9].*$/, ''), 10) || 0);

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export function isSemverNewer(
  candidate: string | null | undefined,
  baseline: string | null | undefined,
): boolean {
  return compareSemver(candidate, baseline) > 0;
}
