export const LAB_INCIDENT_CODES = ['KITCHEN_DELAY', 'STOCKOUT'] as const;

export type LabIncidentCode = (typeof LAB_INCIDENT_CODES)[number];

export const DEFAULT_LAB_INCIDENT_CODES: readonly LabIncidentCode[] = [
  'KITCHEN_DELAY',
  'STOCKOUT',
];

const INCIDENT_ALIASES: Record<string, LabIncidentCode> = {
  KITCHEN_DELAY: 'KITCHEN_DELAY',
  'kitchen-delay': 'KITCHEN_DELAY',
  kitchen_delay: 'KITCHEN_DELAY',
  STOCKOUT: 'STOCKOUT',
  stockout: 'STOCKOUT',
  'stock-out': 'STOCKOUT',
};

export function isLabIncidentCode(value: string): value is LabIncidentCode {
  return (LAB_INCIDENT_CODES as readonly string[]).includes(value);
}

export function canonicalizeLabIncidents(
  input?: readonly string[] | null,
): LabIncidentCode[] {
  if (input == null) {
    return [...DEFAULT_LAB_INCIDENT_CODES];
  }
  const resolved = new Set<LabIncidentCode>();
  for (const raw of input) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const mapped =
      INCIDENT_ALIASES[trimmed] ?? INCIDENT_ALIASES[trimmed.toUpperCase()];
    if (!mapped) {
      throw new Error(
        `Incidente Lab no soportado: ${trimmed}. Permitidos: ${LAB_INCIDENT_CODES.join(', ')}`,
      );
    }
    resolved.add(mapped);
  }
  return LAB_INCIDENT_CODES.filter((code) => resolved.has(code));
}

export interface ObservedLabIncident {
  code: LabIncidentCode;
  logicalEventId: string;
  logicalEntityKey: string;
  correlationId: string;
  detail: string;
}
