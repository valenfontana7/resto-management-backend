import signalsCatalogJson from './signals.v1.json';
import type {
  SignalCategory,
  SignalDirection,
  SignalSeverity,
} from '../types/signal.types';

export interface SignalCatalogEntry {
  code: string;
  category: SignalCategory;
  importance: SignalSeverity;
  direction: SignalDirection;
  dimension: string;
  primaryJob: string;
  description: string;
  explanationTemplate: string;
}

export interface SignalCatalog {
  version: string;
  signals: Record<string, SignalCatalogEntry>;
}

const catalog = signalsCatalogJson as SignalCatalog;

/** Central registry of signal codes — never use string literals elsewhere. */
export const SignalCode = {
  SIG_CFG_01: 'SIG-CFG-01',
  SIG_CFG_02: 'SIG-CFG-02',
  SIG_CFG_03: 'SIG-CFG-03',
  SIG_CFG_05: 'SIG-CFG-05',
  SIG_CFG_06: 'SIG-CFG-06',
  SIG_CFG_07: 'SIG-CFG-07',
  SIG_CFG_08: 'SIG-CFG-08',
  SIG_CFG_09: 'SIG-CFG-09',
  SIG_CFG_10: 'SIG-CFG-10',
  SIG_OPS_02: 'SIG-OPS-02',
  SIG_OPS_07: 'SIG-OPS-07',
  SIG_OPS_09: 'SIG-OPS-09',
  SIG_BIZ_01: 'SIG-BIZ-01',
  SIG_BIZ_03: 'SIG-BIZ-03',
  SIG_RSK_02: 'SIG-RSK-02',
  SIG_RSK_03: 'SIG-RSK-03',
  SIG_RSK_06: 'SIG-RSK-06',
  SIG_RSK_08: 'SIG-RSK-08',
  SIG_ENG_01: 'SIG-ENG-01',
} as const;

export type SignalCodeValue = (typeof SignalCode)[keyof typeof SignalCode];

export function getSignalCatalog(): SignalCatalog {
  return catalog;
}

export function getSignalCatalogEntry(
  code: SignalCodeValue,
): SignalCatalogEntry {
  const entry = catalog.signals[code];
  if (!entry) {
    throw new Error(`Unknown signal code in catalog: ${code}`);
  }
  return entry;
}

export function getCatalogVersion(): string {
  return catalog.version;
}

export function listCatalogCodes(): SignalCodeValue[] {
  return Object.values(SignalCode);
}
