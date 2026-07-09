export type OperationStationKind = 'KITCHEN' | 'BAR' | 'FLOOR' | 'OTHER';

export interface OperationStation {
  id: string;
  name: string;
  kind: OperationStationKind;
  active: boolean;
}

export const DEFAULT_OPERATION_STATIONS: OperationStation[] = [
  { id: 'kitchen', name: 'Cocina', kind: 'KITCHEN', active: true },
  { id: 'bar', name: 'Barra', kind: 'BAR', active: true },
  { id: 'floor', name: 'Salón', kind: 'FLOOR', active: true },
];

const VALID_KINDS = new Set<OperationStationKind>([
  'KITCHEN',
  'BAR',
  'FLOOR',
  'OTHER',
]);

export function getOperationStations(
  businessRules: unknown,
): OperationStation[] {
  const rules =
    businessRules && typeof businessRules === 'object'
      ? (businessRules as Record<string, unknown>)
      : null;
  const operations =
    rules?.operations && typeof rules.operations === 'object'
      ? (rules.operations as Record<string, unknown>)
      : null;
  const raw = operations?.stations;
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_OPERATION_STATIONS.map((s) => ({ ...s }));
  }

  const parsed: OperationStation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const kind = row.kind as OperationStationKind;
    if (!id || !name || !VALID_KINDS.has(kind)) continue;
    parsed.push({
      id,
      name,
      kind,
      active: row.active !== false,
    });
  }

  return parsed.length > 0
    ? parsed
    : DEFAULT_OPERATION_STATIONS.map((s) => ({ ...s }));
}

export function mergeOperationStations(
  businessRules: unknown,
  stations: OperationStation[],
): Record<string, unknown> {
  const base =
    businessRules && typeof businessRules === 'object'
      ? { ...(businessRules as Record<string, unknown>) }
      : {};
  const prevOps =
    base.operations && typeof base.operations === 'object'
      ? { ...(base.operations as Record<string, unknown>) }
      : {};
  return {
    ...base,
    operations: {
      ...prevOps,
      stations,
    },
  };
}

export function normalizeStationsInput(
  input: Array<{
    id: string;
    name: string;
    kind: string;
    active?: boolean;
  }>,
): OperationStation[] {
  const out: OperationStation[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const id = item.id?.trim();
    const name = item.name?.trim();
    const kind = item.kind as OperationStationKind;
    if (!id || !name || !VALID_KINDS.has(kind) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      kind,
      active: item.active !== false,
    });
  }
  return out;
}
