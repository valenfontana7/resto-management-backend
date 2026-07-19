import { ObservedLabIncident } from './lab-incident.types';
import { NormalizedTimelineEvent } from '../core/timeline-normalizer';

export function buildIncidentFingerprint(input: {
  incidentCodes: readonly string[];
  kitchenDelayMinutes: number;
  observedIncidents: readonly ObservedLabIncident[];
  timeline: readonly NormalizedTimelineEvent[];
}): string {
  const incidentEvents = input.timeline
    .filter(
      (event) =>
        event.action.startsWith('incident.') ||
        event.action === 'inventory.consume',
    )
    .map((event) => ({
      offsetMs: event.offsetMs,
      logicalEventId: event.logicalEventId,
      logicalEntityKey: event.logicalEntityKey,
      participantKey: event.participantKey,
      action: event.action,
      resultCode: event.resultCode,
      summary: event.summary,
    }));

  return JSON.stringify({
    incidentCodes: [...input.incidentCodes],
    kitchenDelayMinutes: input.kitchenDelayMinutes,
    observedIncidents: input.observedIncidents.map((incident) => ({
      code: incident.code,
      logicalEventId: incident.logicalEventId,
      logicalEntityKey: incident.logicalEntityKey,
      detail: incident.detail,
    })),
    incidentEvents,
  });
}
