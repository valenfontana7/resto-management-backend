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
  const mercadopagoOrderKeys = new Set<string>();
  const paidOrderKeys = new Set<string>();
  const createdSessionKeys = new Set<string>();
  const createdReservationKeys = new Set<string>();
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
      case 'DELIVERY_CREATE_ORDER':
        if (createdOrderKeys.has(event.orderKey)) {
          throw new Error(`Pedido lógico duplicado: ${event.orderKey}`);
        }
        if (
          event.type === 'CLIENT_CREATE_ONLINE_ORDER' &&
          event.paymentMethod != null &&
          event.paymentMethod !== 'cash' &&
          event.paymentMethod !== 'mercadopago'
        ) {
          throw new Error(
            `CLIENT_CREATE_ONLINE_ORDER paymentMethod inválido: ${event.id}`,
          );
        }
        if (
          event.type === 'DELIVERY_CREATE_ORDER' &&
          !event.deliveryAddress.trim()
        ) {
          throw new Error(`DELIVERY_CREATE_ORDER sin address: ${event.id}`);
        }
        createdOrderKeys.add(event.orderKey);
        if (
          event.type === 'CLIENT_CREATE_ONLINE_ORDER' &&
          event.paymentMethod === 'mercadopago'
        ) {
          mercadopagoOrderKeys.add(event.orderKey);
        }
        break;
      case 'PAYMENT_SYNTHETIC_APPROVE':
        if (!createdOrderKeys.has(event.orderKey)) {
          throw new Error(
            `Evento referencia un pedido aún no creado: ${event.orderKey}`,
          );
        }
        if (!mercadopagoOrderKeys.has(event.orderKey)) {
          throw new Error(
            `PAYMENT_SYNTHETIC_APPROVE requiere order mercadopago: ${event.id}`,
          );
        }
        paidOrderKeys.add(event.orderKey);
        break;
      case 'FISCAL_ISSUE_ORDER':
        if (!createdOrderKeys.has(event.orderKey)) {
          throw new Error(
            `Evento referencia un pedido aún no creado: ${event.orderKey}`,
          );
        }
        if (!paidOrderKeys.has(event.orderKey)) {
          throw new Error(
            `FISCAL_ISSUE_ORDER requiere pago previo (synthetic approve o mark paid): ${event.id}`,
          );
        }
        if (event.documentType != null && !event.documentType.trim()) {
          throw new Error(`FISCAL_ISSUE_ORDER inválido: ${event.id}`);
        }
        break;
      case 'KITCHEN_START_ORDER':
      case 'KITCHEN_READY_ORDER':
      case 'MANAGER_MARK_ORDER_PAID':
      case 'MANAGER_MARK_ORDER_DELIVERED':
      case 'INCIDENT_KITCHEN_DELAY':
      case 'DELIVERY_ADD_ITEMS':
        if (!createdOrderKeys.has(event.orderKey)) {
          throw new Error(
            `Evento referencia un pedido aún no creado: ${event.orderKey}`,
          );
        }
        if (event.type === 'MANAGER_MARK_ORDER_PAID') {
          paidOrderKeys.add(event.orderKey);
        }
        if (
          event.type === 'DELIVERY_ADD_ITEMS' &&
          (!event.dishName.trim() || event.quantity < 1)
        ) {
          throw new Error(`DELIVERY_ADD_ITEMS inválido: ${event.id}`);
        }
        break;
      case 'INCIDENT_STOCKOUT':
        if (!event.inventoryItemKey.trim()) {
          throw new Error(`Stockout sin inventoryItemKey: ${event.id}`);
        }
        break;
      case 'FLOOR_OPEN_TABLE':
        if (createdSessionKeys.has(event.sessionKey)) {
          throw new Error(`Sesión lógica duplicada: ${event.sessionKey}`);
        }
        if (!event.tableNumber.trim()) {
          throw new Error(`FLOOR_OPEN_TABLE sin tableNumber: ${event.id}`);
        }
        createdSessionKeys.add(event.sessionKey);
        break;
      case 'FLOOR_ADD_ITEMS':
        if (!createdSessionKeys.has(event.sessionKey)) {
          throw new Error(
            `FLOOR_ADD_ITEMS referencia sesión inexistente: ${event.sessionKey}`,
          );
        }
        if (!event.dishName.trim() || event.quantity < 1) {
          throw new Error(`FLOOR_ADD_ITEMS inválido: ${event.id}`);
        }
        break;
      case 'FLOOR_SEND_KITCHEN':
        if (!createdSessionKeys.has(event.sessionKey)) {
          throw new Error(
            `Evento floor referencia sesión inexistente: ${event.sessionKey}`,
          );
        }
        break;
      case 'FLOOR_CLOSE_SESSION':
        if (!createdSessionKeys.has(event.sessionKey)) {
          throw new Error(
            `Evento floor referencia sesión inexistente: ${event.sessionKey}`,
          );
        }
        if (
          event.itemSelector != null &&
          event.itemSelector !== 'first-unpaid' &&
          event.itemSelector !== 'all-unpaid'
        ) {
          throw new Error(
            `FLOOR_CLOSE_SESSION itemSelector inválido: ${event.id}`,
          );
        }
        if (
          event.fiscalDocumentType === 'FACTURA_B' &&
          (!event.customerDocType?.trim() || !event.customerDocNumber?.trim())
        ) {
          throw new Error(
            `FLOOR_CLOSE_SESSION FACTURA_B requiere customerDocType/Number: ${event.id}`,
          );
        }
        break;
      case 'FLOOR_MERGE_TABLES':
        if (!createdSessionKeys.has(event.sessionKey)) {
          throw new Error(
            `FLOOR_MERGE_TABLES referencia sesión inexistente: ${event.sessionKey}`,
          );
        }
        if (!event.tableNumbers?.length) {
          throw new Error(`FLOOR_MERGE_TABLES sin tableNumbers: ${event.id}`);
        }
        for (const tableNumber of event.tableNumbers) {
          if (!String(tableNumber).trim()) {
            throw new Error(
              `FLOOR_MERGE_TABLES tableNumber vacío: ${event.id}`,
            );
          }
        }
        break;
      case 'RESERVATION_CREATE':
        if (createdReservationKeys.has(event.reservationKey)) {
          throw new Error(`Reserva lógica duplicada: ${event.reservationKey}`);
        }
        if (
          !event.customerName.trim() ||
          !event.customerPhone.trim() ||
          event.partySize < 1 ||
          !/^\d{2}:\d{2}$/.test(event.time)
        ) {
          throw new Error(`RESERVATION_CREATE inválido: ${event.id}`);
        }
        createdReservationKeys.add(event.reservationKey);
        break;
      case 'COUPON_VALIDATE':
        if (!event.couponCode.trim() || event.orderAmount < 1) {
          throw new Error(`COUPON_VALIDATE inválido: ${event.id}`);
        }
        break;
      case 'LOYALTY_ENROLL':
        if (!event.customerEmail.trim() || !event.customerName.trim()) {
          throw new Error(`LOYALTY_ENROLL inválido: ${event.id}`);
        }
        break;
      case 'REVIEW_CREATE':
        if (
          !event.customerName.trim() ||
          event.rating < 1 ||
          event.rating > 5
        ) {
          throw new Error(`REVIEW_CREATE inválido: ${event.id}`);
        }
        break;
      case 'BUILDER_PUBLIC_GET':
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
