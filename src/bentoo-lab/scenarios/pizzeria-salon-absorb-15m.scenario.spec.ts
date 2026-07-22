import { PIZZERIA_SALON_ABSORB_15M_SCENARIO } from './pizzeria-salon-absorb-15m.scenario';
import { validateLabScenario } from './scenario-validator';

describe('pizzeria-salon-absorb-15m', () => {
  it('valida apertura de dos cuentas y absorción de mesa 5 en 4', () => {
    const scenario = validateLabScenario(PIZZERIA_SALON_ABSORB_15M_SCENARIO);
    expect(scenario.id).toBe('pizzeria-salon-absorb-15m');
    const opens = scenario.events.filter((e) => e.type === 'FLOOR_OPEN_TABLE');
    expect(opens).toHaveLength(2);
    const merge = scenario.events.find((e) => e.type === 'FLOOR_MERGE_TABLES');
    expect(merge).toMatchObject({
      type: 'FLOOR_MERGE_TABLES',
      sessionKey: 'session.floor.0001',
      tableNumbers: ['5'],
    });
    const itemsOnSecondary = scenario.events.find(
      (e) =>
        e.type === 'FLOOR_ADD_ITEMS' && e.sessionKey === 'session.floor.0002',
    );
    expect(itemsOnSecondary).toBeTruthy();
  });
});
