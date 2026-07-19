/**
 * Labels de la historia del turno — español rioplatense, sin jerga interna.
 * Los códigos de dominio (TASK, SHIFT_LEAD, RESOLVED…) no se exponen al usuario.
 */

const COORDINATION_TYPE_LABEL: Record<string, string> = {
  TASK: 'Tarea',
  HEADS_UP: 'Aviso',
  HELP_REQUEST: 'Ayuda',
  APPROVAL: 'Aprobación',
  INCIDENT: 'Incidencia',
};

const COORDINATION_OUTCOME_LABEL: Record<string, string> = {
  RESOLVED: 'resuelta',
  REJECTED: 'rechazada',
  DECLINED: 'rechazada',
  EXPIRED: 'vencida',
  CANCELLED: 'cancelada',
  CANCELED: 'cancelada',
};

export function coordinationTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Coordinación';
  const key = type.trim().toUpperCase();
  return COORDINATION_TYPE_LABEL[key] ?? 'Coordinación';
}

export function coordinationOpenedLabel(
  type: string | null | undefined,
  title: string | null | undefined,
): string {
  const typeLabel = coordinationTypeLabel(type);
  const cleanTitle = (title ?? '').trim();
  if (
    !cleanTitle ||
    cleanTitle.toUpperCase() === 'COORDINACIÓN' ||
    cleanTitle === 'Coordinación'
  ) {
    return typeLabel;
  }
  return `${typeLabel} · ${cleanTitle}`;
}

export function coordinationCompletedLabel(
  outcome: string | null | undefined,
): string {
  if (!outcome) return 'Coordinación resuelta';
  const key = outcome.trim().toUpperCase();
  const human = COORDINATION_OUTCOME_LABEL[key];
  if (human) return `Coordinación ${human}`;
  // Evitar filtrar códigos crudos (RESOLVED, etc.)
  return 'Coordinación resuelta';
}

export function shiftLeadAssignedLabel(): string {
  return 'Encargado del turno asignado';
}

export function shiftOpenedRosterDetail(
  rosterCount: number | undefined,
  segment: string | null | undefined,
): string | undefined {
  if (rosterCount == null) return undefined;
  const people =
    rosterCount === 1
      ? '1 persona en el equipo'
      : `${rosterCount} personas en el equipo`;
  const seg = (segment ?? '').trim();
  return seg ? `${people} · ${seg}` : people;
}
