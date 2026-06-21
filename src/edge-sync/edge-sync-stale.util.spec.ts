import {
  isEdgeServerStale,
  parseEdgeSyncStaleMinutes,
  resolveLastActivityAt,
} from './edge-sync-stale.util';

describe('edge-sync-stale.util', () => {
  const createdAt = new Date('2026-06-19T10:00:00.000Z');
  const now = new Date('2026-06-19T14:00:00.000Z');

  it('usa la actividad más reciente entre push, pull y heartbeat', () => {
    const lastActivity = resolveLastActivityAt({
      createdAt,
      lastSyncPushAt: new Date('2026-06-19T12:00:00.000Z'),
      lastSyncPullAt: new Date('2026-06-19T11:00:00.000Z'),
      lastHeartbeatAt: new Date('2026-06-19T13:30:00.000Z'),
    });

    expect(lastActivity.toISOString()).toBe('2026-06-19T13:30:00.000Z');
  });

  it('marca stale cuando supera el umbral', () => {
    expect(
      isEdgeServerStale(
        {
          createdAt,
          lastSyncPushAt: new Date('2026-06-19T11:00:00.000Z'),
          lastSyncPullAt: null,
          lastHeartbeatAt: null,
        },
        120 * 60_000,
        now,
      ),
    ).toBe(true);
  });

  it('no marca stale dentro del umbral', () => {
    expect(
      isEdgeServerStale(
        {
          createdAt,
          lastSyncPushAt: new Date('2026-06-19T13:30:00.000Z'),
          lastSyncPullAt: null,
          lastHeartbeatAt: null,
        },
        120 * 60_000,
        now,
      ),
    ).toBe(false);
  });

  it('parsea minutos con fallback seguro', () => {
    expect(parseEdgeSyncStaleMinutes(undefined)).toBe(120);
    expect(parseEdgeSyncStaleMinutes('90')).toBe(90);
    expect(parseEdgeSyncStaleMinutes('0')).toBe(120);
    expect(parseEdgeSyncStaleMinutes('abc')).toBe(120);
  });
});
