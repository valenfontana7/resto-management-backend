export interface TimelineEventForNormalization {
  sequence: number;
  logicalEventId: string;
  logicalEntityKey: string;
  simulatedAt: Date;
  realAt: Date;
  participantKey: string;
  domain: string;
  action: string;
  resultCode: string;
  entityId?: string | null;
  correlationId: string;
  summary: string;
}

export interface NormalizedTimelineEvent {
  sequence: number;
  offsetMs: number;
  logicalEventId: string;
  logicalEntityKey: string;
  participantKey: string;
  domain: string;
  action: string;
  resultCode: string;
  summary: string;
}

export function normalizeTimeline(
  events: readonly TimelineEventForNormalization[],
  simulatedStartAt: Date,
): NormalizedTimelineEvent[] {
  const startMs = simulatedStartAt.getTime();
  return [...events]
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => ({
      sequence: event.sequence,
      offsetMs: event.simulatedAt.getTime() - startMs,
      logicalEventId: event.logicalEventId,
      logicalEntityKey: event.logicalEntityKey,
      participantKey: event.participantKey,
      domain: event.domain,
      action: event.action,
      resultCode: event.resultCode,
      summary: event.summary,
    }));
}
