import {
  FloorStructureKind,
  type FloorStructureElementDto,
} from './dto/table.dto';

export type FloorStructureElement = {
  id: string;
  kind: FloorStructureKind;
  label: string | null;
  x: number;
  y: number;
  widthPct: number;
  heightPct: number;
  rotationDeg: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStructureKind(value: unknown): FloorStructureKind | null {
  if (value === FloorStructureKind.WALL || value === 'wall') {
    return FloorStructureKind.WALL;
  }
  if (value === FloorStructureKind.BLOCK || value === 'block') {
    return FloorStructureKind.BLOCK;
  }
  return null;
}

/** Normaliza un array de estructuras (máx. 40). */
export function normalizeStructureElements(
  input: unknown,
): FloorStructureElement[] {
  if (!Array.isArray(input)) return [];

  const out: FloorStructureElement[] = [];
  const seen = new Set<string>();

  for (const raw of input.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as FloorStructureElementDto;
    const id = String(item.id ?? '')
      .trim()
      .slice(0, 64);
    if (!id || seen.has(id)) continue;
    const kind = asStructureKind(item.kind);
    if (!kind) continue;

    const labelRaw =
      item.label === null || item.label === undefined
        ? null
        : String(item.label).trim().slice(0, 24);
    const label = labelRaw && labelRaw.length > 0 ? labelRaw : null;

    seen.add(id);
    out.push({
      id,
      kind,
      label,
      x: clamp(asNumber(item.x, 50), 0, 100),
      y: clamp(asNumber(item.y, 50), 0, 100),
      widthPct: clamp(
        asNumber(item.widthPct, kind === FloorStructureKind.WALL ? 28 : 14),
        1,
        100,
      ),
      heightPct: clamp(
        asNumber(item.heightPct, kind === FloorStructureKind.WALL ? 2 : 10),
        1,
        100,
      ),
      rotationDeg: Math.round(clamp(asNumber(item.rotationDeg, 0), 0, 359)),
    });
  }

  return out;
}

export function parseStructureElements(
  value: unknown,
): FloorStructureElement[] {
  return normalizeStructureElements(value);
}
