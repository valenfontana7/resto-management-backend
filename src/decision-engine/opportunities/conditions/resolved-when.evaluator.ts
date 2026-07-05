import type { ResolvedWhenRule } from '../catalog/opportunity-catalog.loader';
import type { SnapshotView } from '../context/snapshot-context.helper';
import {
  countActivePillars,
  hasSignal,
  isBandAtLeast,
  isBandAtMost,
  lacksSignal,
} from '../context/snapshot-context.helper';

export function isResolvedWhen(
  rule: ResolvedWhenRule,
  view: SnapshotView,
): boolean {
  switch (rule.type) {
    case 'signal_present':
      return hasSignal(view, rule.signalCode!);
    case 'signal_absent':
      return lacksSignal(view, rule.signalCode!);
    case 'any_signal_present':
      return (rule.signalCodes ?? []).some((code) => hasSignal(view, code));
    case 'rss_band_min':
      return isBandAtLeast(view, rule.band!);
    case 'rss_band_max':
      return isBandAtMost(view, rule.band!);
    case 'multiple_pillars_active':
      return (
        countActivePillars(view, rule.minimumScore ?? 60) >=
        (rule.minimumCount ?? 2)
      );
    default: {
      const _exhaustive: never = rule.type;
      return _exhaustive;
    }
  }
}

export function resolvedWhenReason(
  rule: ResolvedWhenRule,
  view: SnapshotView,
): string {
  if (!isResolvedWhen(rule, view)) {
    return 'Condición de cierre no cumplida';
  }

  switch (rule.type) {
    case 'signal_present':
      return `Señal ${rule.signalCode} activa en snapshot`;
    case 'signal_absent':
      return `Señal ${rule.signalCode} ya no está activa`;
    case 'any_signal_present':
      return `Al menos una señal objetivo activa: ${(rule.signalCodes ?? []).join(', ')}`;
    case 'rss_band_min':
      return `RSS mejoró a banda ${view.snapshot.rss.band} (mínimo ${rule.band})`;
    case 'rss_band_max':
      return `RSS ya no está en banda de expansión (${view.snapshot.rss.band})`;
    case 'multiple_pillars_active':
      return `${countActivePillars(view, rule.minimumScore ?? 60)} pilares activos`;
    default: {
      const _exhaustive: never = rule.type;
      return _exhaustive;
    }
  }
}
