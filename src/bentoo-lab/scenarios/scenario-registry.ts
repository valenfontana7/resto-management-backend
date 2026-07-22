import { PIZZERIA_CLOSEOUT_10M_SCENARIO } from './pizzeria-closeout-10m.scenario';
import { PIZZERIA_FRIDAY_30M_SCENARIO } from './pizzeria-friday-30m.scenario';
import { PIZZERIA_GROWTH_10M_SCENARIO } from './pizzeria-growth-10m.scenario';
import { PIZZERIA_OPS_15M_SCENARIO } from './pizzeria-ops-15m.scenario';
import { PIZZERIA_PAYMENTS_15M_SCENARIO } from './pizzeria-payments-15m.scenario';
import { PIZZERIA_SALON_10M_SCENARIO } from './pizzeria-salon-10m.scenario';
import { PIZZERIA_SALON_ABSORB_15M_SCENARIO } from './pizzeria-salon-absorb-15m.scenario';
import { PIZZERIA_SALON_MERGE_15M_SCENARIO } from './pizzeria-salon-merge-15m.scenario';
import { PIZZERIA_SALON_SPLIT_15M_SCENARIO } from './pizzeria-salon-split-15m.scenario';
import { validateLabScenario } from './scenario-validator';
import { LabScenarioDefinition } from './scenario.types';

const SCENARIOS = [
  validateLabScenario(PIZZERIA_FRIDAY_30M_SCENARIO),
  validateLabScenario(PIZZERIA_CLOSEOUT_10M_SCENARIO),
  validateLabScenario(PIZZERIA_SALON_10M_SCENARIO),
  validateLabScenario(PIZZERIA_SALON_SPLIT_15M_SCENARIO),
  validateLabScenario(PIZZERIA_SALON_MERGE_15M_SCENARIO),
  validateLabScenario(PIZZERIA_SALON_ABSORB_15M_SCENARIO),
  validateLabScenario(PIZZERIA_OPS_15M_SCENARIO),
  validateLabScenario(PIZZERIA_GROWTH_10M_SCENARIO),
  validateLabScenario(PIZZERIA_PAYMENTS_15M_SCENARIO),
] as const;

export function listLabScenarios(): readonly LabScenarioDefinition[] {
  return SCENARIOS;
}

export function getLabScenario(
  scenarioId: string,
  scenarioVersion?: string,
): LabScenarioDefinition {
  const scenario = SCENARIOS.find(
    (candidate) =>
      candidate.id === scenarioId &&
      (!scenarioVersion || candidate.version === scenarioVersion),
  );
  if (!scenario) {
    throw new Error(
      `Escenario Lab inexistente: ${scenarioId}${
        scenarioVersion ? `@${scenarioVersion}` : ''
      }`,
    );
  }
  return scenario;
}
