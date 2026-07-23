import {
  CouponType,
  CashRegisterLevel,
  CashRegisterSessionStatus,
  CashMovementType,
  FiscalDocumentStatus,
  FiscalDocumentType,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentStatus,
  Prisma,
  type PrismaClient,
  ReservationStatus,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { DemoWorld } from '../types';
import { DEMO_FLAGSHIP_TAG } from '../types';

function orderAt(dayOffset: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - dayOffset);
  return d;
}

function mapChannel(channel: string): OrderType {
  if (channel === 'delivery') return OrderType.DELIVERY;
  if (channel === 'pickup') return OrderType.PICKUP;
  return OrderType.DINE_IN;
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'CONFIRMED':
      return OrderStatus.CONFIRMED;
    case 'PREPARING':
      return OrderStatus.PREPARING;
    case 'READY':
      return OrderStatus.READY;
    case 'DELIVERED':
      return OrderStatus.DELIVERED;
    case 'CANCELLED':
      return OrderStatus.CANCELLED;
    default:
      return OrderStatus.PENDING;
  }
}

async function wipeDemoOps(prisma: PrismaClient, restaurantId: string) {
  await prisma.orderStatusHistory.deleteMany({
    where: { order: { restaurantId } },
  });
  await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
  await prisma.order.deleteMany({ where: { restaurantId } });
  await prisma.reservation.deleteMany({ where: { restaurantId } });
  await prisma.review.deleteMany({ where: { restaurantId } });
  await prisma.couponUsage.deleteMany({ where: { coupon: { restaurantId } } });
  await prisma.coupon.deleteMany({ where: { restaurantId } });
  await prisma.inventoryItem.deleteMany({ where: { restaurantId } });

  await prisma.fiscalDocument.deleteMany({ where: { restaurantId } });
  await prisma.cashMovement.deleteMany({
    where: { cashSession: { restaurantId } },
  });
  await prisma.tableSessionItemModifier.deleteMany({
    where: { sessionItem: { session: { restaurantId } } },
  });
  await prisma.tableSessionItem.deleteMany({
    where: { session: { restaurantId } },
  });
  await prisma.tableSession.deleteMany({ where: { restaurantId } });
  await prisma.cashRegisterSession.deleteMany({ where: { restaurantId } });
  await prisma.dailyOperation.deleteMany({ where: { restaurantId } });

  await prisma.table.deleteMany({ where: { restaurantId } });
  await prisma.tableArea.deleteMany({ where: { restaurantId } });
  await prisma.dish.deleteMany({ where: { restaurantId } });
  await prisma.category.deleteMany({ where: { restaurantId } });
  await prisma.restaurantCustomerProfile.deleteMany({
    where: { restaurantId },
  });
  await prisma.businessHour.deleteMany({ where: { restaurantId } });
}

async function ensureOwnerUser(
  prisma: PrismaClient,
  world: DemoWorld,
): Promise<string> {
  const email = `owner+${world.profile.slug}@demo.bentoo.local`;
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) return existing.id;

  const passwordHash = await bcrypt.hash('DemoFlagship2026!', 10);
  const owner = world.staff.find((s) => s.role === 'OWNER');
  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name: owner?.name ?? world.profile.ownerName,
    },
  });
  return user.id;
}

export async function materializeDemoTenant(
  prisma: PrismaClient,
  world: DemoWorld,
  options: { fresh?: boolean } = {},
): Promise<{ restaurantId: string; slug: string }> {
  const { profile } = world;
  const ownerUserId = await ensureOwnerUser(prisma, world);

  const businessRules = {
    demoShowcase: true,
    demoFlagship: true,
    demoTag: DEMO_FLAGSHIP_TAG,
  };

  let restaurant = await prisma.restaurant.findUnique({
    where: { slug: profile.slug },
  });

  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        slug: profile.slug,
        name: profile.name,
        type: profile.type,
        cuisineTypes: profile.cuisine,
        description: profile.description,
        logo: profile.media.logo,
        coverImage: profile.media.cover,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        city: profile.city,
        country: 'Argentina',
        branding: {
          logo: profile.media.logo,
          coverImage: profile.media.cover,
        } as Prisma.InputJsonValue,
        socialMedia: { instagram: profile.instagram } as Prisma.InputJsonValue,
        businessRules: businessRules as Prisma.InputJsonValue,
        onboardingIncomplete: false,
        isPublished: true,
        isIndexable: false,
        status: 'ACTIVE',
      },
    });
  } else {
    restaurant = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        name: profile.name,
        type: profile.type,
        cuisineTypes: profile.cuisine,
        description: profile.description,
        logo: profile.media.logo,
        coverImage: profile.media.cover,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        city: profile.city,
        businessRules: {
          ...((restaurant.businessRules as object) ?? {}),
          ...businessRules,
        } as Prisma.InputJsonValue,
        onboardingIncomplete: false,
        isPublished: true,
        isIndexable: false,
      },
    });
  }

  await prisma.user.update({
    where: { id: ownerUserId },
    data: { restaurantId: restaurant.id },
  });

  await prisma.restaurantMembership.upsert({
    where: {
      userId_restaurantId: {
        userId: ownerUserId,
        restaurantId: restaurant.id,
      },
    },
    create: {
      userId: ownerUserId,
      restaurantId: restaurant.id,
      isDefault: true,
    },
    update: { isDefault: true },
  });

  void options;
  await wipeDemoOps(prisma, restaurant.id);

  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  for (const [day, hours] of Object.entries(profile.hours)) {
    await prisma.businessHour.create({
      data: {
        restaurantId: restaurant.id,
        dayOfWeek: dayMap[day],
        openTime: hours.closed ? '00:00' : hours.open,
        closeTime: hours.closed ? '00:00' : hours.close,
        isOpen: !hours.closed,
      },
    });
  }

  const dishIdByName = new Map<string, string>();
  for (const cat of world.categories) {
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: cat.name,
        description: cat.name,
        order: cat.order,
        isActive: true,
      },
    });
    for (const dish of world.dishes.filter((d) => d.categoryId === cat.id)) {
      const created = await prisma.dish.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: category.id,
          name: dish.name,
          description: dish.description,
          price: dish.price,
          costPrice: dish.costPrice,
          image: dish.image,
          preparationTime: dish.prepMinutes,
          isAvailable: true,
          isFeatured: dish.featured,
          tags: [...dish.tags, DEMO_FLAGSHIP_TAG],
        },
      });
      dishIdByName.set(dish.name, created.id);
    }
  }

  for (const item of world.inventory) {
    const linkedDishIds = item.linkedDishNames
      .map((n) => dishIdByName.get(n))
      .filter((id): id is string => Boolean(id));
    await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurant.id,
        name: item.name,
        unit: item.unit,
        currentStock: item.quantity,
        minStock: item.lowStockThreshold,
        linkedDishIds,
        notes: DEMO_FLAGSHIP_TAG,
      },
    });
  }

  const areaIds = new Map<string, string>();
  const tableIdByNumber = new Map<number, string>();
  for (const table of world.tables) {
    if (!areaIds.has(table.area)) {
      const area = await prisma.tableArea.create({
        data: {
          restaurantId: restaurant.id,
          name: table.area,
        },
      });
      areaIds.set(table.area, area.id);
    }
    const createdTable = await prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        areaId: areaIds.get(table.area),
        number: String(table.number),
        capacity: table.capacity,
        label: table.label,
        status: TableStatus.AVAILABLE,
      },
    });
    tableIdByNumber.set(table.number, createdTable.id);
  }

  const profileIdByCustomerId = new Map<string, string>();
  let phoneSeq = 0;
  for (const customer of world.customers) {
    phoneSeq += 1;
    const phone =
      `+549${profile.slug.slice(0, 3)}${String(1000000 + phoneSeq).padStart(7, '0')}`
        .replace(/[^+\d]/g, '')
        .slice(0, 18);

    let identity = await prisma.customerIdentity.findUnique({
      where: { email: customer.email },
    });
    if (!identity) {
      const phoneTaken = await prisma.customerIdentity.findUnique({
        where: { phone },
      });
      identity = await prisma.customerIdentity.create({
        data: {
          email: customer.email,
          phone: phoneTaken ? null : phone,
          emailVerified: true,
        },
      });
    }

    const profileRow = await prisma.restaurantCustomerProfile.create({
      data: {
        restaurantId: restaurant.id,
        identityId: identity.id,
        displayName: customer.name,
        email: customer.email,
        phone: identity.phone ?? phone,
        preferences: {
          segment: customer.segment,
          favorites: customer.favoriteDishNames,
        },
      },
    });
    profileIdByCustomerId.set(customer.id, profileRow.id);
  }

  const now = new Date();
  const until = new Date();
  until.setMonth(until.getMonth() + 3);
  for (const promo of world.promos) {
    await prisma.coupon.create({
      data: {
        restaurantId: restaurant.id,
        code: promo.code,
        name: promo.name,
        description: promo.description,
        type: CouponType.PERCENTAGE,
        value: promo.discountPercent,
        validFrom: now,
        validUntil: until,
        isActive: true,
        applicableProducts: [],
      },
    });
  }

  const recent = [...world.orders]
    .filter((o) => o.dayOffset <= 45)
    .sort((a, b) => b.dayOffset - a.dayOffset);
  let orderNumber = 1000;
  for (const order of recent) {
    orderNumber += 1;
    const createdAt = orderAt(order.dayOffset, order.hour, order.minute);
    const status = mapStatus(order.status);
    const type = mapChannel(order.channel);
    const deliveryFee = type === OrderType.DELIVERY ? 1800 : 0;
    const total = order.total + deliveryFee;
    const customer = order.customerId
      ? world.customers.find((c) => c.id === order.customerId)
      : undefined;

    const confirm = order.kitchen.find((k) => k.status === 'CONFIRMED');
    const preparing = order.kitchen.find((k) => k.status === 'PREPARING');
    const ready = order.kitchen.find((k) => k.status === 'READY');
    const delivered = order.kitchen.find((k) => k.status === 'DELIVERED');
    const addMin = (base: Date, mins: number) =>
      new Date(base.getTime() + mins * 60_000);

    const items = order.items
      .map((item) => {
        const dishId = dishIdByName.get(item.dishName);
        if (!dishId) return null;
        return {
          dishId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.unitPrice * item.quantity,
        };
      })
      .filter(Boolean) as Array<{
      dishId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;

    if (!items.length) continue;

    await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        orderNumber: `${profile.slug.slice(0, 3).toUpperCase()}-${orderNumber}`,
        customerName: order.customerName,
        customerEmail: customer?.email,
        customerPhone: customer?.phone ?? '+5491100000000',
        customerProfileId: order.customerId
          ? profileIdByCustomerId.get(order.customerId)
          : undefined,
        type,
        status,
        paymentMethod: 'CASH',
        paymentStatus:
          status === OrderStatus.CANCELLED
            ? PaymentStatus.FAILED
            : PaymentStatus.PAID,
        subtotal: order.subtotal,
        deliveryFee,
        total,
        orderSource: OrderSource.ONLINE,
        notes: order.notes,
        publicTrackingToken: `track-${profile.slug}-${orderNumber}`,
        createdAt,
        updatedAt: createdAt,
        confirmedAt: confirm
          ? addMin(createdAt, confirm.atOffsetMinutes)
          : undefined,
        preparingAt: preparing
          ? addMin(createdAt, preparing.atOffsetMinutes)
          : undefined,
        readyAt: ready ? addMin(createdAt, ready.atOffsetMinutes) : undefined,
        deliveredAt: delivered
          ? addMin(createdAt, delivered.atOffsetMinutes)
          : undefined,
        paidAt:
          status === OrderStatus.CANCELLED ? undefined : addMin(createdAt, 2),
        items: { create: items },
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              createdAt,
            },
            ...(status !== OrderStatus.PENDING
              ? [
                  {
                    fromStatus: OrderStatus.PENDING,
                    toStatus: status,
                    createdAt: confirm
                      ? addMin(createdAt, confirm.atOffsetMinutes)
                      : createdAt,
                  },
                ]
              : []),
          ],
        },
      },
    });
  }

  for (const res of world.reservations.filter((r) => r.dayOffset <= 14)) {
    const when = orderAt(res.dayOffset, res.hour, res.minute);
    const time = `${String(res.hour).padStart(2, '0')}:${String(res.minute).padStart(2, '0')}`;
    await prisma.reservation.create({
      data: {
        restaurantId: restaurant.id,
        customerName: res.customerName,
        customerEmail: `${res.id}@reserva.demo`,
        customerPhone: '+5491199990000',
        date: when,
        time,
        partySize: res.partySize,
        status:
          res.status === 'NO_SHOW'
            ? ReservationStatus.NO_SHOW
            : res.status === 'PENDING'
              ? ReservationStatus.PENDING
              : res.status === 'COMPLETED'
                ? ReservationStatus.COMPLETED
                : ReservationStatus.CONFIRMED,
        notes: res.occasion ?? res.tableLabel,
        specialRequests: res.tableLabel,
      },
    });
  }

  for (const review of world.reviews) {
    const dishId = review.dishName
      ? dishIdByName.get(review.dishName)
      : undefined;
    await prisma.review.create({
      data: {
        restaurantId: restaurant.id,
        customerName: review.customerName,
        rating: review.rating,
        comment: review.comment,
        isApproved: review.rating >= 3,
        dishId,
        createdAt: orderAt(review.dayOffset, 18, 0),
      },
    });
  }

  await materializeFloorFiscal(prisma, {
    restaurantId: restaurant.id,
    ownerUserId,
    world,
    dishIdByName,
    tableIdByNumber,
  });

  return { restaurantId: restaurant.id, slug: profile.slug };
}

function mapFiscalType(
  type: string,
): (typeof FiscalDocumentType)[keyof typeof FiscalDocumentType] {
  switch (type) {
    case 'FACTURA_A':
      return FiscalDocumentType.FACTURA_A;
    case 'FACTURA_C':
      return FiscalDocumentType.FACTURA_C;
    case 'INTERNAL_TICKET':
      return FiscalDocumentType.INTERNAL_TICKET;
    case 'FACTURA_B':
    default:
      return FiscalDocumentType.FACTURA_B;
  }
}

async function materializeFloorFiscal(
  prisma: PrismaClient,
  input: {
    restaurantId: string;
    ownerUserId: string;
    world: DemoWorld;
    dishIdByName: Map<string, string>;
    tableIdByNumber: Map<number, string>;
  },
) {
  const { restaurantId, ownerUserId, world, dishIdByName, tableIdByNumber } =
    input;
  const floor = world.operationalSnapshot.floor;
  const now = new Date();

  const businessDate = new Date(
    `${now.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );
  await prisma.dailyOperation.create({
    data: {
      restaurantId,
      businessDate,
      dailyGoal: `Turno demo ${world.profile.name}`,
      openingCompletedAt: new Date(
        now.getTime() - floor.cashRegister.openedAtOffsetMinutes * 60_000,
      ),
      openingNotes: 'Apertura sembrada por seed:demo-flagships',
    },
  });

  const cash = await prisma.cashRegisterSession.create({
    data: {
      restaurantId,
      level: CashRegisterLevel.PARTIAL,
      openedByUserId: ownerUserId,
      openedByName: floor.cashRegister.openedByName,
      openingFloat: floor.cashRegister.openingFloat,
      expectedCash: floor.cashRegister.expectedCash,
      status: CashRegisterSessionStatus.OPEN,
      openedAt: new Date(
        now.getTime() - floor.cashRegister.openedAtOffsetMinutes * 60_000,
      ),
      notes: floor.cashRegister.notes,
    },
  });

  for (const movement of floor.cashRegister.movements) {
    const type =
      movement.type === 'OPENING_FLOAT'
        ? CashMovementType.OPENING_FLOAT
        : movement.type === 'DEPOSIT'
          ? CashMovementType.DEPOSIT
          : CashMovementType.SALE;
    await prisma.cashMovement.create({
      data: {
        sessionId: cash.id,
        type,
        amount: movement.amount,
        paymentMethod: movement.paymentMethod,
        description: movement.description,
        createdByUserId: ownerUserId,
        createdByName: floor.cashRegister.openedByName,
        createdAt: new Date(
          now.getTime() - movement.createdAtOffsetMinutes * 60_000,
        ),
      },
    });
  }

  let sessionSeq = 0;
  for (const open of floor.openSessions) {
    sessionSeq += 1;
    const tableId = tableIdByNumber.get(open.tableNumber);
    if (!tableId) continue;

    const items = open.items
      .map((item) => {
        const dishId = dishIdByName.get(item.dishName);
        if (!dishId) return null;
        return {
          dishId,
          name: item.dishName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
          kitchenStatus: 'SENT' as const,
          sentToKitchenAt: new Date(
            now.getTime() - open.openedAtOffsetMinutes * 60_000,
          ),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (!items.length) continue;

    const session = await prisma.tableSession.create({
      data: {
        restaurantId,
        tableId,
        sessionNumber: `FLG-S${sessionSeq}`,
        status: TableSessionStatus.OPEN,
        waiterName: open.waiterName,
        guestCount: open.guestCount,
        customerName: open.customerName,
        subtotal: open.subtotal,
        total: open.subtotal,
        openedAt: new Date(now.getTime() - open.openedAtOffsetMinutes * 60_000),
        cashRegisterSessionId: cash.id,
        items: { create: items },
      },
    });

    await prisma.table.update({
      where: { id: tableId },
      data: {
        status: TableStatus.OCCUPIED,
        currentSessionId: session.id,
      },
    });
  }

  // Closed sessions + fiscal docs (reuse tables not currently occupied)
  const freeTables = [...tableIdByNumber.entries()].filter(
    ([num]) => !floor.openSessions.some((s) => s.tableNumber === num),
  );

  for (let i = 0; i < floor.fiscalDocuments.length; i++) {
    const doc = floor.fiscalDocuments[i];
    const tableEntry = freeTables[i % Math.max(freeTables.length, 1)];
    const tableId = tableEntry?.[1] ?? [...tableIdByNumber.values()][0];
    if (!tableId) continue;

    const closedAt = orderAt(doc.dayOffset, doc.hour, doc.minute);
    const openedAt = new Date(closedAt.getTime() - 55 * 60_000);
    sessionSeq += 1;

    const hitDish =
      world.dishes.find((d) => d.name === world.profile.hits[0]) ??
      world.dishes[0];
    const dishId = hitDish ? dishIdByName.get(hitDish.name) : undefined;

    const closedSession = await prisma.tableSession.create({
      data: {
        restaurantId,
        tableId,
        sessionNumber: `FLG-C${sessionSeq}`,
        status: TableSessionStatus.CLOSED,
        waiterName: floor.cashRegister.openedByName,
        guestCount: 2,
        customerName: doc.customerName ?? 'Consumidor Final',
        subtotal: doc.subtotal,
        total: doc.total,
        openedAt,
        closedAt,
        cashRegisterSessionId: cash.id,
        items: dishId
          ? {
              create: [
                {
                  dishId,
                  name: hitDish.name,
                  quantity: 1,
                  unitPrice: doc.subtotal,
                  subtotal: doc.subtotal,
                  kitchenStatus: 'SERVED',
                  sentToKitchenAt: openedAt,
                },
              ],
            }
          : undefined,
      },
    });

    const caeExpiresAt = new Date(closedAt.getTime() + 10 * 24 * 60 * 60_000);
    await prisma.fiscalDocument.create({
      data: {
        restaurantId,
        tableSessionId: closedSession.id,
        type: mapFiscalType(doc.type),
        status: FiscalDocumentStatus.AUTHORIZED,
        puntoVenta: doc.puntoVenta,
        numero: doc.numero,
        cae: doc.cae,
        caeExpiresAt,
        customerName: doc.customerName ?? 'Consumidor Final',
        customerDocType: '99',
        customerDocNumber: '0',
        customerIvaCondition: 5,
        subtotal: doc.subtotal,
        ivaAmount: doc.ivaAmount,
        total: doc.total,
        createdAt: closedAt,
        updatedAt: closedAt,
      },
    });
  }
}
