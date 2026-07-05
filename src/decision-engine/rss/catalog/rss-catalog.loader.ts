import algorithmJson from './algorithm.v1.json';
import bandsJson from './bands.v1.json';
import weightsJson from './weights.v1.json';
import { getSignalCatalogEntry } from '../../signals/catalog/signal-catalog.loader';
import type { SignalSeverity } from '../../signals/types/signal.types';

export type RssDimensionId =
  | 'configuration'
  | 'operation'
  | 'business'
  | 'engagement'
  | 'relationship';

export type RssBandId =
  | 'champion'
  | 'healthy'
  | 'attention'
  | 'at_risk'
  | 'critical';

export interface RssAlgorithmCatalog {
  algorithmVersion: string;
  version: string;
  importancePoints: Record<SignalSeverity, number>;
  negativePenaltyMultiplier: number;
  missingRequiredMultiplier: number;
  dimensions: Record<
    RssDimensionId,
    {
      rssWeight: number;
      label: string;
      rfcAlias: string;
      neutralScoreWhenNoApplicableSignals?: number;
      scoringMode?: 'risk_inverted';
    }
  >;
  intentRequiredSignals: Record<
    string,
    Partial<Record<RssDimensionId, string[]>>
  >;
  intentIgnoredSignals: Record<string, string[]>;
  overlays: OverlayRule[];
  earlyAccountGraceDays: number;
  topFactorsLimit: number;
  signalBoosts?: SignalBoostRule[];
}

export interface OverlayRule {
  id: string;
  signalCode?: string;
  signalCodes?: string[];
  maxRss?: number;
  forceBand?: RssBandId;
  minTenureDays?: number;
  maxBandScore?: number;
}

export interface SignalBoostRule {
  id: string;
  requiredActiveSignals: string[];
  dimension?: RssDimensionId;
  minimumScore?: number;
  whenMaxTenureDays?: number;
  whenSignalActive?: string;
  dimensionBoosts?: Partial<Record<RssDimensionId, number>>;
}

export interface RssBandsCatalog {
  version: string;
  bands: {
    id: RssBandId;
    label: string;
    minInclusive: number;
    maxInclusive: number;
  }[];
}

export interface RssWeightsCatalog {
  version: string;
  signalWeights: Record<
    string,
    { dimension: RssDimensionId; direction: 'positive' | 'negative' }
  >;
}

const algorithm = algorithmJson as RssAlgorithmCatalog;
const bands = bandsJson as RssBandsCatalog;
const weights = weightsJson as RssWeightsCatalog;

export function getRssAlgorithmCatalog(): RssAlgorithmCatalog {
  return algorithm;
}

export function getRssAlgorithmVersion(): string {
  return algorithm.algorithmVersion;
}

export function getRssWeightsCatalog(): RssWeightsCatalog {
  return weights;
}

export function getRssBandsCatalog(): RssBandsCatalog {
  return bands;
}

export function getImportancePoints(severity: SignalSeverity): number {
  return algorithm.importancePoints[severity];
}

export function getSignalsForDimension(dimensionId: RssDimensionId): string[] {
  return Object.entries(weights.signalWeights)
    .filter(([, w]) => w.dimension === dimensionId)
    .map(([code]) => code);
}

export function getRequiredSignalsForIntent(
  intent: string,
  dimensionId: RssDimensionId,
): string[] {
  return algorithm.intentRequiredSignals[intent]?.[dimensionId] ?? [];
}

export function isSignalIgnoredForIntent(
  intent: string,
  signalCode: string,
): boolean {
  return (algorithm.intentIgnoredSignals[intent] ?? []).includes(signalCode);
}

export function resolveBand(score: number): RssBandId {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of bands.bands) {
    if (clamped >= band.minInclusive && clamped <= band.maxInclusive) {
      return band.id;
    }
  }
  return 'critical';
}

export function getBandLabel(bandId: RssBandId): string {
  return bands.bands.find((b) => b.id === bandId)?.label ?? bandId;
}

export function getSignalLabel(code: string): string {
  try {
    return getSignalCatalogEntry(code as never).description;
  } catch {
    return code;
  }
}

export const RSS_DIMENSION_IDS: RssDimensionId[] = [
  'configuration',
  'operation',
  'business',
  'engagement',
  'relationship',
];
