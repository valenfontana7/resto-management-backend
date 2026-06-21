export type EdgeActivityTimestamps = {
  lastSyncPushAt: Date | null;
  lastSyncPullAt: Date | null;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
};

export function resolveLastActivityAt(record: EdgeActivityTimestamps): Date {
  const candidates = [
    record.lastSyncPushAt,
    record.lastSyncPullAt,
    record.lastHeartbeatAt,
  ].filter((value): value is Date => value instanceof Date);

  if (candidates.length === 0) {
    return record.createdAt;
  }

  return new Date(Math.max(...candidates.map((value) => value.getTime())));
}

export function isEdgeServerStale(
  record: EdgeActivityTimestamps,
  staleAfterMs: number,
  now = new Date(),
): boolean {
  if (staleAfterMs <= 0) {
    return false;
  }

  const lastActivity = resolveLastActivityAt(record);
  return now.getTime() - lastActivity.getTime() >= staleAfterMs;
}

export function parseEdgeSyncStaleMinutes(raw?: string): number {
  const parsed = Number.parseInt(String(raw ?? '120').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 120;
  }
  return parsed;
}
