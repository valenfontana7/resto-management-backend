import { LabScenarioDefinition, LabScenarioEvent } from './scenario.types';

export function validateLabScenario(
  scenario: LabScenarioDefinition,
): LabScenarioDefinition {
  if (!scenario.id.trim() || !scenario.version.trim()) {
    throw new Error('El escenario requiere id y versión');
  }
  if (
    !Number.isInteger(scenario.durationMinutes) ||
    scenario.durationMinutes < 1
  ) {
    throw new Error('La duración del escenario debe ser un entero positivo');
  }
  if (Number.isNaN(new Date(scenario.simulatedStartAt).getTime())) {
    throw new Error('La hora inicial simulada no es válida');
  }
  if (scenario.menu.length === 0) {
    throw new Error('El escenario requiere al menos un producto');
  }

  assertUnique(
    scenario.menu.map((item) => item.key),
    'producto',
  );
  assertUnique(
    scenario.events.map((event) => event.id),
    'evento',
  );

  const createdOrderKeys = new Set<string>();
  let completeCount = 0;
  let previousMinute = -1;

  for (const event of scenario.events) {
    if (
      event.atMinute < 0 ||
      event.atMinute > scenario.durationMinutes ||
      event.atMinute < previousMinute
    ) {
      throw new Error(`Tiempo inválido para ${event.id}`);
    }
    previousMinute = event.atMinute;

    switch (event.type) {
      case 'CLIENT_CREATE_ONLINE_ORDER':
        if (createdOrderKeys.has(event.orderKey)) {
          throw new Error(`Pedido lógico duplicado: ${event.orderKey}`);
        }
        createdOrderKeys.add(event.orderKey);
        break;
      case 'KITCHEN_START_ORDER':
      case 'KITCHEN_READY_ORDER':
      case 'MANAGER_MARK_ORDER_PAID':
      case 'INCIDENT_KITCHEN_DELAY':
        if (!createdOrderKeys.has(event.orderKey)) {
          throw new Error(
            `Evento referencia un pedido aún no creado: ${event.orderKey}`,
          );
        }
        break;
      case 'INCIDENT_STOCKOUT':
        if (!event.inventoryItemKey.trim()) {
          throw new Error(`Stockout sin inventoryItemKey: ${event.id}`);
        }
        break;
      case 'SIMULATION_COMPLETE':
        completeCount += 1;
        if (event.atMinute !== scenario.durationMinutes) {
          throw new Error('El cierre debe coincidir con la duración declarada');
        }
        break;
      default:
        assertNever(event);
    }
  }

  if (completeCount !== 1) {
    throw new Error('El escenario requiere exactamente un evento de cierre');
  }

  return scenario;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Hay un ${label} duplicado`);
  }
}

function assertNever(value: never): never {
  throw new Error(
    `Evento de escenario no soportado: ${JSON.stringify(
      value as LabScenarioEvent,
    )}`,
  );
}
