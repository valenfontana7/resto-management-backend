import {
  CashRegisterLevel,
  CashRegisterSessionStatus,
  Prisma,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import { OPENING_CHECKLIST_IDS } from '../../floor/dto/daily-operation.dto';

type Tx = Prisma.TransactionClient;

export interface OpsCoreSeedInput {
  restaurantId: string;
  managerUserId: string;
  managerName: string;
  waiterUserId: string;
  waiterName: string;
  mozzarellaDishId: string;
  fugazzetaDishId: string;
  mozzarellaPrice: number;
  fugazzetaPrice: number;
  simulatedStartAt: Date;
}

function businessDateUtc(simulatedStartAt: Date): Date {
  return new Date(
    `${simulatedStartAt.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );
}

function openingChecklistComplete(): Prisma.InputJsonValue {
  return Object.fromEntries(
    OPENING_CHECKLIST_IDS.map((id) => [id, true]),
  ) as Prisma.InputJsonValue;
}

/**
 * Seed HITL de operación dura: mesas, día abierto, caja parcial, 2 cuentas,
 * zona delivery y reservas PENDING.
 */
export async function seedOpsCoreFloor(
  tx: Tx,
  input: OpsCoreSeedInput,
): Promise<{ deliveryZoneId: string }> {
  const businessDate = businessDateUtc(input.simulatedStartAt);

  await tx.dailyOperation.create({
    data: {
      restaurantId: input.restaurantId,
      businessDate,
      dailyGoal: 'Turno Lab ops-core',
      openingChecklist: openingChecklistComplete(),
      openingCompletedAt: input.simulatedStartAt,
      openingNotes: 'Apertura sembrada por Bentoo Lab',
    },
  });

  const cash = await tx.cashRegisterSession.create({
    data: {
      restaurantId: input.restaurantId,
      level: CashRegisterLevel.PARTIAL,
      openedByUserId: input.managerUserId,
      openedByName: input.managerName,
      openingFloat: 10000,
      expectedCash: 10000,
      status: CashRegisterSessionStatus.OPEN,
      openedAt: input.simulatedStartAt,
      notes: 'Caja parcial Lab',
    },
  });

  const area = await tx.tableArea.create({
    data: {
      restaurantId: input.restaurantId,
      name: 'Salón principal',
    },
  });

  const tableSpecs = [
    { number: '1', capacity: 2, x: 10, y: 15 },
    { number: '2', capacity: 2, x: 30, y: 15 },
    { number: '3', capacity: 4, x: 50, y: 15 },
    { number: '4', capacity: 4, x: 70, y: 15 },
    { number: '5', capacity: 4, x: 10, y: 45 },
    { number: '6', capacity: 6, x: 35, y: 45 },
    { number: '7', capacity: 6, x: 60, y: 45 },
    { number: '8', capacity: 8, x: 80, y: 45 },
  ] as const;

  const tables: Array<{ id: string; number: string }> = [];
  for (const spec of tableSpecs) {
    const table = await tx.table.create({
      data: {
        restaurantId: input.restaurantId,
        areaId: area.id,
        number: spec.number,
        capacity: spec.capacity,
        status: TableStatus.AVAILABLE,
        positionX: spec.x,
        positionY: spec.y,
        widthPct: 10,
        heightPct: 10,
      },
      select: { id: true, number: true },
    });
    tables.push(table);
  }

  const table1 = tables[0];
  const table3 = tables[2];

  const session1 = await tx.tableSession.create({
    data: {
      restaurantId: input.restaurantId,
      tableId: table1.id,
      sessionNumber: 'LAB-S1',
      status: TableSessionStatus.OPEN,
      waiterId: input.waiterUserId,
      waiterName: input.waiterName,
      guestCount: 2,
      customerName: 'Mesa Lab 1',
      subtotal: input.mozzarellaPrice,
      total: input.mozzarellaPrice,
      openedAt: input.simulatedStartAt,
      cashRegisterSessionId: cash.id,
      items: {
        create: [
          {
            dishId: input.mozzarellaDishId,
            name: 'Pizza muzzarella',
            quantity: 1,
            unitPrice: input.mozzarellaPrice,
            subtotal: input.mozzarellaPrice,
            kitchenStatus: 'SENT',
            sentToKitchenAt: input.simulatedStartAt,
          },
        ],
      },
    },
  });

  const session2Subtotal = input.fugazzetaPrice * 2;
  const session2 = await tx.tableSession.create({
    data: {
      restaurantId: input.restaurantId,
      tableId: table3.id,
      sessionNumber: 'LAB-S2',
      status: TableSessionStatus.OPEN,
      waiterId: input.waiterUserId,
      waiterName: input.waiterName,
      guestCount: 4,
      customerName: 'Mesa Lab 3',
      subtotal: session2Subtotal,
      total: session2Subtotal,
      openedAt: input.simulatedStartAt,
      cashRegisterSessionId: cash.id,
      items: {
        create: [
          {
            dishId: input.fugazzetaDishId,
            name: 'Fugazzeta',
            quantity: 2,
            unitPrice: input.fugazzetaPrice,
            subtotal: session2Subtotal,
            kitchenStatus: 'PREPARING',
            sentToKitchenAt: input.simulatedStartAt,
          },
        ],
      },
    },
  });

  await tx.table.update({
    where: { id: table1.id },
    data: {
      status: TableStatus.OCCUPIED,
      currentSessionId: session1.id,
      waiter: input.waiterName,
      customerName: 'Mesa Lab 1',
      occupiedSince: input.simulatedStartAt,
    },
  });

  await tx.table.update({
    where: { id: table3.id },
    data: {
      status: TableStatus.OCCUPIED,
      currentSessionId: session2.id,
      waiter: input.waiterName,
      customerName: 'Mesa Lab 3',
      occupiedSince: input.simulatedStartAt,
    },
  });

  const deliveryZone = await tx.deliveryZone.create({
    data: {
      restaurantId: input.restaurantId,
      name: 'Lab Centro',
      deliveryFee: 1500,
      minOrder: 0,
      estimatedTime: '30-45 min',
      isActive: true,
      areas: ['Lab'],
    },
    select: { id: true },
  });

  await tx.reservation.createMany({
    data: [
      {
        restaurantId: input.restaurantId,
        customerName: 'Reserva Lab 1',
        customerEmail: 'reserva-1@lab.bentoo.invalid',
        customerPhone: '+54 11 5555-0101',
        date: businessDate,
        time: '20:00',
        partySize: 2,
        status: 'PENDING',
        notes: 'Seed HITL Lab',
      },
      {
        restaurantId: input.restaurantId,
        customerName: 'Reserva Lab 2',
        customerEmail: 'reserva-2@lab.bentoo.invalid',
        customerPhone: '+54 11 5555-0102',
        date: businessDate,
        time: '21:00',
        partySize: 4,
        status: 'PENDING',
        notes: 'Seed HITL Lab',
      },
    ],
  });

  const now = new Date();
  const validFrom = new Date(now);
  validFrom.setUTCFullYear(validFrom.getUTCFullYear() - 1);
  const validUntil = new Date(now);
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 2);

  await tx.coupon.create({
    data: {
      restaurantId: input.restaurantId,
      code: 'LAB10',
      name: 'Lab 10%',
      description: 'Cupón seed Bentoo Lab',
      type: 'PERCENTAGE',
      value: 10,
      minOrderAmount: 1000,
      maxDiscountAmount: 5000,
      isActive: true,
      validFrom,
      validUntil,
      applicableProducts: [],
      applicableCategories: [],
    },
  });

  await tx.review.create({
    data: {
      restaurantId: input.restaurantId,
      customerName: 'Reviewer Lab',
      customerEmail: 'reviewer@lab.bentoo.invalid',
      rating: 5,
      comment: 'Seed HITL Lab',
      isApproved: true,
      dishId: input.mozzarellaDishId,
    },
  });

  await tx.builderConfig.create({
    data: {
      restaurantId: input.restaurantId,
      version: '1.0.0-lab',
      isPublished: true,
      config: {
        labStub: true,
        theme: { primary: '#111111' },
        pages: [{ id: 'home', name: 'Inicio' }],
      },
    },
  });

  return { deliveryZoneId: deliveryZone.id };
}
