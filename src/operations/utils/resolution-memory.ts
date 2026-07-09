import { CoordinationPriority } from '@prisma/client';

export const RESOLUTION_MEMORY_PREFIX = 'resolution:';
export const SUPPRESSION_THRESHOLD = 3;

export interface ResolutionPatternMetadata {
  situationType: string;
  daypart?: string;
  episodeIds: string[];
  successCount: number;
  totalCount: number;
  successRate: number;
  ignoreCount: number;
  medianImpact?: {
    metric: string;
    valueBefore?: number;
    valueAfter?: number;
    unit?: string;
  };
  lastAppliedAt?: string;
  lastSummary?: string;
}

export interface ResolutionPrecedent {
  memoryKey: string;
  title: string;
  summary: string | null;
  occurrenceCount: number;
  successRate: number;
  ignoreCount: number;
  medianImpact?: ResolutionPatternMetadata['medianImpact'];
  lastAppliedAt?: string;
}

export function buildResolutionMemoryKey(
  situationType: string,
  daypart?: string,
): string {
  const base = situationType.trim().toLowerCase().replace(/\s+/g, '-');
  return daypart
    ? `${RESOLUTION_MEMORY_PREFIX}${base}:${daypart.toLowerCase()}`
    : `${RESOLUTION_MEMORY_PREFIX}${base}`;
}

export function isIgnoredOutcome(
  outcome: string,
  summary?: string | null,
): boolean {
  const normalized = outcome.toUpperCase();
  if (normalized === 'NO_EFFECT' || normalized === 'CANCELLED') {
    return true;
  }
  const text = (summary ?? '').trim().toLowerCase();
  return text.includes('ignor') || text.includes('omit');
}

export function shouldPromotePattern(input: {
  occurrenceCount: number;
  hasMeasuredImpact: boolean;
}): boolean {
  return input.occurrenceCount >= 2 || input.hasMeasuredImpact;
}

export function computeSuccessRate(
  successCount: number,
  totalCount: number,
): number {
  if (totalCount <= 0) return 0;
  return Math.round((successCount / totalCount) * 100) / 100;
}

export function applyPrioritySuppression(
  priority: CoordinationPriority,
  ignoreCount: number,
): CoordinationPriority {
  if (ignoreCount < SUPPRESSION_THRESHOLD) {
    return priority;
  }

  const order: CoordinationPriority[] = [
    CoordinationPriority.CRITICAL,
    CoordinationPriority.HIGH,
    CoordinationPriority.NORMAL,
    CoordinationPriority.LOW,
  ];
  const idx = order.indexOf(priority);
  if (idx < 0 || idx >= order.length - 1) {
    return CoordinationPriority.LOW;
  }
  return order[idx + 1];
}

export function formatPrecedentLine(precedent: ResolutionPrecedent): string {
  const rate = Math.round(precedent.successRate * 100);
  const impact =
    precedent.medianImpact?.valueBefore != null &&
    precedent.medianImpact?.valueAfter != null
      ? ` (${precedent.medianImpact.valueBefore}→${precedent.medianImpact.valueAfter}${precedent.medianImpact.unit ? ` ${precedent.medianImpact.unit}` : ''})`
      : '';
  const base =
    precedent.summary?.trim() ||
    `La última vez se resolvió así (${precedent.occurrenceCount} casos, ${rate}% éxito)`;
  return `Precedente: ${base}${impact}`;
}

export function appendPrecedentDescription(
  description: string | undefined,
  precedent: ResolutionPrecedent,
): string {
  const line = formatPrecedentLine(precedent);
  if (!description?.trim()) return line;
  if (description.includes('Precedente:')) return description;
  return `${description.trim()}\n${line}`;
}

export function parseResolutionMetadata(
  metadata: unknown,
): ResolutionPatternMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata as Partial<ResolutionPatternMetadata>;
  if (!raw.situationType) return null;
  return {
    situationType: raw.situationType,
    daypart: raw.daypart,
    episodeIds: Array.isArray(raw.episodeIds) ? raw.episodeIds : [],
    successCount: raw.successCount ?? 0,
    totalCount: raw.totalCount ?? 0,
    successRate: raw.successRate ?? 0,
    ignoreCount: raw.ignoreCount ?? 0,
    medianImpact: raw.medianImpact,
    lastAppliedAt: raw.lastAppliedAt,
    lastSummary: raw.lastSummary,
  };
}
