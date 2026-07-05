import strategiesCatalogJson from './strategies.v1.json';

export type RecommendationStrategyId =
  | 'educate'
  | 'assist'
  | 'recover'
  | 'expand'
  | 'celebrate'
  | 'warn'
  | 'validate';

export interface StrategyCatalogEntry {
  id: RecommendationStrategyId;
  label: string;
  description: string;
}

export interface StrategyCatalog {
  version: string;
  strategies: Record<RecommendationStrategyId, StrategyCatalogEntry>;
}

const catalog = strategiesCatalogJson as StrategyCatalog;

export const RecommendationStrategy = {
  EDUCATE: 'educate',
  ASSIST: 'assist',
  RECOVER: 'recover',
  EXPAND: 'expand',
  CELEBRATE: 'celebrate',
  WARN: 'warn',
  VALIDATE: 'validate',
} as const satisfies Record<string, RecommendationStrategyId>;

export function getStrategyCatalog(): StrategyCatalog {
  return catalog;
}

export function getStrategyEntry(
  id: RecommendationStrategyId,
): StrategyCatalogEntry {
  const entry = catalog.strategies[id];
  if (!entry) {
    throw new Error(`Unknown recommendation strategy: ${id}`);
  }
  return entry;
}

export function getStrategyCatalogVersion(): string {
  return catalog.version;
}

export function explainStrategyChoice(
  strategyId: RecommendationStrategyId,
): string {
  return `Estrategia ${getStrategyEntry(strategyId).label}: ${getStrategyEntry(strategyId).description}`;
}
