import type { OpportunityCatalogEntry } from '../catalog/opportunity-catalog.loader';
import type { OpportunityPriority } from '../catalog/opportunity-catalog.loader';
import type { SnapshotView } from '../context/snapshot-context.helper';
import { isRssBand } from '../context/snapshot-context.helper';

export function deriveOpportunityPriority(
  entry: OpportunityCatalogEntry,
  view: SnapshotView,
): OpportunityPriority {
  if (entry.code === 'OPP-RSK-03') {
    return 'critical';
  }

  if (entry.code === 'OPP-RSK-01') {
    if (view.snapshot.rss.band === 'critical') {
      return 'critical';
    }
    if (isRssBand(view, ['at_risk'])) {
      return 'high';
    }
  }

  if (
    entry.category === 'gap' &&
    view.snapshot.metadata.tenureDays > 7 &&
    entry.basePriority === 'high'
  ) {
    return 'high';
  }

  return entry.basePriority;
}

export function explainPriority(
  entry: OpportunityCatalogEntry,
  priority: OpportunityPriority,
  view: SnapshotView,
): string {
  if (entry.code === 'OPP-RSK-03') {
    return 'Prioridad critical porque hay cancelación iniciada (SIG-RSK-03).';
  }
  if (entry.code === 'OPP-RSK-01' && view.snapshot.rss.band === 'critical') {
    return 'Prioridad critical porque el RSS está en banda Critical.';
  }
  if (entry.code === 'OPP-RSK-01' && view.snapshot.rss.band === 'at_risk') {
    return 'Prioridad high porque el RSS está en banda At Risk.';
  }
  return `Prioridad ${priority} según catálogo OPP y banda RSS ${view.snapshot.rss.bandLabel}.`;
}
