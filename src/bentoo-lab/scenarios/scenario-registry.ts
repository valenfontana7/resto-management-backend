import { PIZZERIA_FRIDAY_30M_SCENARIO } from './pizzeria-friday-30m.scenario';
import { validateLabScenario } from './scenario-validator';
import { LabScenarioDefinition } from './scenario.types';

const SCENARIOS = [validateLabScenario(PIZZERIA_FRIDAY_30M_SCENARIO)] as const;

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
