import { validateLabScenario } from './scenario-validator';
import { LabScenarioDefinition } from './scenario.types';

function baseScenario(
  events: LabScenarioDefinition['events'],
): LabScenarioDefinition {
  return {
    id: 'test',
    version: '1.0.0',
    label: 'Test',
    durationMinutes: 10,
    simulatedStartAt: '2026-07-21T12:00:00.000Z',
    defaultSpeed: 20,
    restaurant: { type: 'pizzeria', channels: ['online'] },
    menu: [
      { key: 'pizza', name: 'Pizza', price: 1000, preparationMinutes: 10 },
    ],
    participants: ['client', 'manager'],
    events,
    invariants: ['TENANT_SCOPE'],
  };
}

describe('validateLabScenario payment/fiscal', () => {
  it('rechaza PAYMENT_SYNTHETIC_APPROVE sin mercadopago', () => {
    expect(() =>
      validateLabScenario(
        baseScenario([
          {
            id: 'o1',
            type: 'CLIENT_CREATE_ONLINE_ORDER',
            participantKey: 'client',
            atMinute: 1,
            priority: 10,
            orderKey: 'a',
            paymentMethod: 'cash',
          },
          {
            id: 'p1',
            type: 'PAYMENT_SYNTHETIC_APPROVE',
            participantKey: 'system',
            atMinute: 2,
            priority: 20,
            orderKey: 'a',
          },
          {
            id: 'end',
            type: 'SIMULATION_COMPLETE',
            participantKey: 'system',
            atMinute: 10,
            priority: 100,
          },
        ]),
      ),
    ).toThrow(/requiere order mercadopago/);
  });

  it('rechaza FISCAL_ISSUE_ORDER sin pago previo', () => {
    expect(() =>
      validateLabScenario(
        baseScenario([
          {
            id: 'o1',
            type: 'CLIENT_CREATE_ONLINE_ORDER',
            participantKey: 'client',
            atMinute: 1,
            priority: 10,
            orderKey: 'a',
            paymentMethod: 'mercadopago',
          },
          {
            id: 'f1',
            type: 'FISCAL_ISSUE_ORDER',
            participantKey: 'manager',
            atMinute: 2,
            priority: 20,
            orderKey: 'a',
          },
          {
            id: 'end',
            type: 'SIMULATION_COMPLETE',
            participantKey: 'system',
            atMinute: 10,
            priority: 100,
          },
        ]),
      ),
    ).toThrow(/requiere pago previo/);
  });

  it('acepta mercadopago → approve → fiscal', () => {
    expect(
      validateLabScenario(
        baseScenario([
          {
            id: 'o1',
            type: 'CLIENT_CREATE_ONLINE_ORDER',
            participantKey: 'client',
            atMinute: 1,
            priority: 10,
            orderKey: 'a',
            paymentMethod: 'mercadopago',
          },
          {
            id: 'p1',
            type: 'PAYMENT_SYNTHETIC_APPROVE',
            participantKey: 'system',
            atMinute: 2,
            priority: 20,
            orderKey: 'a',
          },
          {
            id: 'f1',
            type: 'FISCAL_ISSUE_ORDER',
            participantKey: 'manager',
            atMinute: 3,
            priority: 30,
            orderKey: 'a',
            documentType: 'FACTURA_B',
          },
          {
            id: 'end',
            type: 'SIMULATION_COMPLETE',
            participantKey: 'system',
            atMinute: 10,
            priority: 100,
          },
        ]),
      ).id,
    ).toBe('test');
  });
});
