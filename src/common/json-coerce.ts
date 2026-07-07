/** Returns `value` when it is a string; otherwise `fallback`. Avoids `[object Object]` from String(unknown). */
export function asOptionalString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
