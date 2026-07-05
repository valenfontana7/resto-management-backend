import opportunitiesCatalogJson from './opportunities.v1.json';
import type {
  RssBandId,
  RssDimensionId,
} from '../../rss/catalog/rss-catalog.loader';

export type OpportunityCategory = 'gap' | 'risk' | 'expansion' | 'milestone';
export type OpportunityPriority = 'critical' | 'high' | 'medium' | 'low';
export type OpportunityConfidence = 'high' | 'medium' | 'low';

export interface ResolvedWhenRule {
  type:
    | 'signal_present'
    | 'signal_absent'
    | 'any_signal_present'
    | 'rss_band_min'
    | 'rss_band_max'
    | 'multiple_pillars_active';
  signalCode?: string;
  signalCodes?: string[];
  band?: RssBandId;
  minimumScore?: number;
  minimumCount?: number;
}

export interface OpportunityCatalogEntry {
  code: string;
  category: OpportunityCategory;
  basePriority: OpportunityPriority;
  baseConfidence: OpportunityConfidence;
  primaryJob: string;
  title: string;
  description: string;
  expectedOutcome: string;
  recommendedActionType: string;
  suggestedAction: string;
  rssDimensions: RssDimensionId[];
  requiredSignals?: string[];
  absentSignals?: string[];
  inactiveSignals?: string[];
  rssBands?: RssBandId[];
  configMinimumScore?: number;
  rfcLiteralCondition?: string;
  minimumTenureDays?: number;
  maximumTenureDays?: number;
  requiresTrialContext?: boolean;
  minimumTrialDay?: number;
  singlePillarMinimumScore?: number;
  minimumPillarScore?: number;
  minimumActivePillars?: number;
  suppressOnCriticalBand?: boolean;
  resolvedWhen: ResolvedWhenRule;
  ruleId: string;
}

export interface OpportunityCatalog {
  version: string;
  maxOpen: number;
  defaultExpireDays: number;
  opportunities: Record<string, OpportunityCatalogEntry>;
}

const catalog = opportunitiesCatalogJson as OpportunityCatalog;

/** Central registry of opportunity codes — never use string literals elsewhere. */
export const OpportunityCode = {
  OPP_CFG_01: 'OPP-CFG-01',
  OPP_CFG_02: 'OPP-CFG-02',
  OPP_CFG_04: 'OPP-CFG-04',
  OPP_OPS_02: 'OPP-OPS-02',
  OPP_RSK_01: 'OPP-RSK-01',
  OPP_RSK_03: 'OPP-RSK-03',
  OPP_RSK_05: 'OPP-RSK-05',
  OPP_RSK_07: 'OPP-RSK-07',
  OPP_EXP_04: 'OPP-EXP-04',
  OPP_EXP_06: 'OPP-EXP-06',
} as const;

export type OpportunityCodeValue =
  (typeof OpportunityCode)[keyof typeof OpportunityCode];

export function getOpportunityCatalog(): OpportunityCatalog {
  return catalog;
}

export function getOpportunityCatalogEntry(
  code: OpportunityCodeValue,
): OpportunityCatalogEntry {
  const entry = catalog.opportunities[code];
  if (!entry) {
    throw new Error(`Unknown opportunity code in catalog: ${code}`);
  }
  return entry;
}

export function getOpportunityCatalogVersion(): string {
  return catalog.version;
}

export function getMaxOpenOpportunities(): number {
  return catalog.maxOpen;
}

export function getDefaultExpireDays(): number {
  return catalog.defaultExpireDays;
}

export function listOpportunityCodes(): OpportunityCodeValue[] {
  return Object.values(OpportunityCode);
}
