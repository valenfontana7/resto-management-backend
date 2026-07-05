/** TTL por defecto para snapshots de inteligencia en batch (15 min). */
export const INTELLIGENCE_SNAPSHOT_TTL_MS = 15 * 60 * 1000;

export function isIntelligenceSnapshotFresh(
  computedAtIso: string,
  ttlMs = INTELLIGENCE_SNAPSHOT_TTL_MS,
): boolean {
  const computedAt = Date.parse(computedAtIso);
  if (Number.isNaN(computedAt)) return false;
  return Date.now() - computedAt < ttlMs;
}
