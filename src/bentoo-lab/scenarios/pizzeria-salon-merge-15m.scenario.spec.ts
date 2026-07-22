import { PIZZERIA_SALON_MERGE_15M_SCENARIO } from './pizzeria-salon-merge-15m.scenario';
import { validateLabScenario } from './scenario-validator';

describe('pizzeria-salon-merge-15m', () => {
  it('valida y une mesa 5 a la sesión de mesa 4', () => {
    const scenario = validateLabScenario(PIZZERIA_SALON_MERGE_15M_SCENARIO);
    expect(scenario.id).toBe('pizzeria-salon-merge-15m');
    const merge = scenario.events.find((e) => e.type === 'FLOOR_MERGE_TABLES');
    expect(merge).toMatchObject({
      type: 'FLOOR_MERGE_TABLES',
      sessionKey: 'session.floor.0001',
      tableNumbers: ['5'],
    });
  });
});
