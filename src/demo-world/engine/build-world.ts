/**
 * Builds a full DemoWorld from a StoryProfile (deterministic).
 */

import { chance, createPrng, intBetween, pickIndex, pickOne } from '../prng';
import type {
  CustomerSegment,
  DayOfWeek,
  DemoOrderChannel,
  DemoOrderStatus,
  DemoWorld,
  OperationalSnapshot,
  OperationalSnapshotFiscalDocument,
  OperationalSnapshotFloor,
  StoryProfile,
  WorldAnalytics,
  WorldCategory,
  WorldCustomer,
  WorldDish,
  WorldInventoryItem,
  WorldOrder,
  WorldOrderItem,
  WorldPromo,
  WorldReservation,
  WorldReview,
  WorldStaff,
  WorldSupplier,
  WorldTable,
} from '../types';

const DAYS: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const FIRST_NAMES = [
  'Ana',
  'Bruno',
  'Camila',
  'Diego',
  'Elena',
  'Federico',
  'Gisela',
  'Hernán',
  'Ivana',
  'Javier',
  'Karina',
  'Lucas',
  'Micaela',
  'Nicolás',
  'Ornella',
  'Pablo',
  'Rocío',
  'Santiago',
  'Tamara',
  'Ulises',
  'Valeria',
  'Walter',
  'Ximena',
  'Yanina',
  'Zoe',
  'Agustín',
  'Belén',
  'Cecilia',
  'Damián',
  'Esteban',
];

const LAST_NAMES = [
  'García',
  'Rodríguez',
  'López',
  'Martínez',
  'González',
  'Pérez',
  'Sánchez',
  'Romero',
  'Fernández',
  'Torres',
  'Álvarez',
  'Ruiz',
  'Ramírez',
  'Flores',
  'Acosta',
  'Benítez',
  'Castro',
  'Domínguez',
  'Espinoza',
  'Figueroa',
];

function dayOfWeekFromOffset(dayOffset: number): DayOfWeek {
  // dayOffset 0 = today; compute weekday from "today" assuming script runs any day —
  // use absolute: treat dayOffset so that we map via Date relative to a fixed epoch-like
  // approach: use JS Date with today - dayOffset.
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - dayOffset);
  return DAYS[d.getDay()];
}

function slugifyId(prefix: string, slug: string, n: number): string {
  return `${prefix}-${slug}-${n}`;
}

function buildMenu(profile: StoryProfile): {
  categories: WorldCategory[];
  dishes: WorldDish[];
} {
  const categoryNames: string[] = [];
  for (const dish of profile.menu) {
    if (!categoryNames.includes(dish.category))
      categoryNames.push(dish.category);
  }

  const categories: WorldCategory[] = categoryNames.map((name, i) => ({
    id: slugifyId('cat', profile.slug, i + 1),
    name,
    order: i,
  }));

  const catByName = new Map(categories.map((c) => [c.name, c]));
  const dishes: WorldDish[] = profile.menu.map((d, i) => {
    const cat = catByName.get(d.category)!;
    return {
      id: slugifyId('dish', profile.slug, i + 1),
      categoryId: cat.id,
      categoryName: cat.name,
      name: d.name,
      description: d.description,
      price: d.price,
      costPrice: d.costPrice,
      prepMinutes: d.prepMinutes,
      featured: Boolean(d.featured),
      hitWeight: d.hitWeight,
      image: d.image || profile.media.hero,
      tags: d.tags ?? [],
      order: i,
    };
  });

  return { categories, dishes };
}

function buildCustomers(
  profile: StoryProfile,
  dishes: WorldDish[],
  rand: () => number,
): WorldCustomer[] {
  const hitNames = profile.hits;
  const customers: WorldCustomer[] = [];
  const segments: Array<{ segment: CustomerSegment; count: number }> = [
    { segment: 'vip', count: 4 },
    { segment: 'regular', count: 12 },
    { segment: 'churn_return', count: 3 },
    { segment: 'one_shot', count: 10 },
  ];

  let n = 0;
  for (const { segment, count } of segments) {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const first = pickOne(rand, FIRST_NAMES);
      const last = pickOne(rand, LAST_NAMES);
      const name = `${first} ${last}`;
      const email =
        `${first.toLowerCase()}.${last.toLowerCase()}.${n}@mail.demo`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9.@]/g, '');

      let firstOrderDayOffset: number;
      let lastOrderDayOffset: number;
      let orderCountTarget: number;

      if (segment === 'vip') {
        firstOrderDayOffset = intBetween(rand, 50, profile.historyDays - 1);
        lastOrderDayOffset = intBetween(rand, 0, 5);
        orderCountTarget = intBetween(rand, 12, 22);
      } else if (segment === 'regular') {
        firstOrderDayOffset = intBetween(rand, 30, profile.historyDays - 1);
        lastOrderDayOffset = intBetween(rand, 0, 10);
        orderCountTarget = intBetween(rand, 5, 11);
      } else if (segment === 'churn_return') {
        firstOrderDayOffset = intBetween(rand, 55, profile.historyDays - 1);
        lastOrderDayOffset = intBetween(rand, 0, 8);
        orderCountTarget = intBetween(rand, 3, 5);
      } else {
        firstOrderDayOffset = intBetween(rand, 1, profile.historyDays - 5);
        lastOrderDayOffset = firstOrderDayOffset;
        orderCountTarget = 1;
      }

      const favorites = hitNames.length
        ? hitNames.slice(0, intBetween(rand, 1, Math.min(3, hitNames.length)))
        : [pickOne(rand, dishes).name];

      customers.push({
        id: slugifyId('cust', profile.slug, n),
        name,
        email,
        phone: `+54 9 11 ${intBetween(rand, 2000, 6999)}-${intBetween(rand, 1000, 9999)}`,
        segment,
        favoriteDishNames: favorites,
        firstOrderDayOffset,
        lastOrderDayOffset,
        orderCountTarget,
      });
    }
  }

  return customers;
}

function pickDishesForOrder(
  dishes: WorldDish[],
  rand: () => number,
  channel: DemoOrderChannel,
  hour: number,
  favorites: string[],
): WorldOrderItem[] {
  const weights = dishes.map((d) => {
    let w = d.hitWeight;
    if (favorites.includes(d.name)) w *= 2.2;
    if (channel === 'delivery' && d.tags.includes('combo')) w *= 1.5;
    if (hour >= 12 && hour <= 15 && d.tags.includes('combo')) w *= 1.4;
    if (hour >= 20 && d.price > 12000) w *= 1.25;
    return w;
  });

  const itemCount =
    channel === 'dine_in' ? intBetween(rand, 2, 4) : intBetween(rand, 1, 3);
  const items: WorldOrderItem[] = [];
  const used = new Set<string>();

  for (let i = 0; i < itemCount; i += 1) {
    const idx = pickIndex(rand, weights);
    const dish = dishes[idx];
    if (used.has(dish.id) && dishes.length > 1) {
      i -= 1;
      continue;
    }
    used.add(dish.id);
    items.push({
      dishId: dish.id,
      dishName: dish.name,
      quantity: chance(rand, 0.2) ? 2 : 1,
      unitPrice: dish.price,
    });
  }

  return items;
}

function buildKitchen(
  status: DemoOrderStatus,
  prepMinutes: number,
  delayed: boolean,
  rand: () => number,
): WorldOrder['kitchen'] {
  if (status === 'CANCELLED') {
    return [
      { status: 'PENDING', atOffsetMinutes: 0 },
      { status: 'CANCELLED', atOffsetMinutes: intBetween(rand, 3, 12) },
    ];
  }

  const delay = delayed ? intBetween(rand, 12, 22) : 0;
  const confirm = intBetween(rand, 1, 4);
  const preparing = confirm + intBetween(rand, 2, 6);
  const ready = preparing + prepMinutes + delay;
  const delivered = ready + intBetween(rand, 5, 25);

  const chain: WorldOrder['kitchen'] = [
    { status: 'PENDING', atOffsetMinutes: 0 },
    { status: 'CONFIRMED', atOffsetMinutes: confirm },
    { status: 'PREPARING', atOffsetMinutes: preparing },
    { status: 'READY', atOffsetMinutes: ready },
  ];

  if (status === 'DELIVERED' || status === 'READY') {
    if (status === 'DELIVERED') {
      chain.push({ status: 'DELIVERED', atOffsetMinutes: delivered });
    }
  }

  return chain;
}

function buildOrders(
  profile: StoryProfile,
  dishes: WorldDish[],
  customers: WorldCustomer[],
  rand: () => number,
): WorldOrder[] {
  const orders: WorldOrder[] = [];
  let orderN = 0;

  const weekdayBase: Record<DayOfWeek, number> = {
    monday: profile.slowDays.includes('monday') ? 2 : 4,
    tuesday: profile.slowDays.includes('tuesday') ? 2 : 4,
    wednesday: 5,
    thursday: 6,
    friday: profile.busyDays.includes('friday') ? 10 : 6,
    saturday: profile.busyDays.includes('saturday') ? 11 : 6,
    sunday: profile.busyDays.includes('sunday') ? 8 : 3,
  };

  // Assign customer order slots
  const customerQueue: WorldCustomer[] = [];
  for (const c of customers) {
    for (let i = 0; i < c.orderCountTarget; i += 1) {
      customerQueue.push(c);
    }
  }
  // shuffle deterministically
  for (let i = customerQueue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [customerQueue[i], customerQueue[j]] = [customerQueue[j], customerQueue[i]];
  }
  let queueIdx = 0;

  for (
    let dayOffset = profile.historyDays - 1;
    dayOffset >= 0;
    dayOffset -= 1
  ) {
    const dow = dayOfWeekFromOffset(dayOffset);
    const hoursCfg = profile.hours[dow];
    if (hoursCfg.closed) continue;

    let count = weekdayBase[dow] + intBetween(rand, -1, 2);
    if (dayOffset === 0) count = Math.max(count, 5);
    count = Math.max(1, count);

    for (let o = 0; o < count; o += 1) {
      orderN += 1;
      const openH = Number(hoursCfg.open.split(':')[0]);
      const closeH = Number(hoursCfg.close.split(':')[0]) || 23;
      let hour: number;
      if (chance(rand, 0.55)) {
        hour = pickOne(
          rand,
          profile.peakHours.filter((h) => h >= openH && h < closeH),
        );
        if (hour == null)
          hour = intBetween(rand, openH, Math.max(openH, closeH - 1));
      } else if (chance(rand, 0.15)) {
        hour =
          pickOne(rand, profile.deadHours) ??
          intBetween(rand, openH, closeH - 1);
      } else {
        hour = intBetween(rand, openH, Math.max(openH, closeH - 1));
      }
      const minute = intBetween(rand, 0, 59);

      let channel: DemoOrderChannel;
      if (profile.slug === 'burger-lab') {
        channel = chance(rand, 0.55)
          ? 'delivery'
          : chance(rand, 0.5)
            ? 'pickup'
            : 'dine_in';
        if ((dow === 'friday' || dow === 'saturday') && hour >= 20) {
          channel = chance(rand, 0.75) ? 'delivery' : 'pickup';
        }
      } else if (profile.slug === 'cafe-central') {
        channel =
          hour < 11
            ? chance(rand, 0.6)
              ? 'pickup'
              : 'dine_in'
            : chance(rand, 0.25)
              ? 'pickup'
              : 'dine_in';
      } else {
        channel = chance(rand, 0.35)
          ? 'delivery'
          : chance(rand, 0.25)
            ? 'pickup'
            : 'dine_in';
        if (dow === 'sunday')
          channel = chance(rand, 0.7) ? 'dine_in' : 'pickup';
      }

      const customer =
        queueIdx < customerQueue.length && chance(rand, 0.72)
          ? customerQueue[queueIdx++]
          : chance(rand, 0.4)
            ? pickOne(rand, customers)
            : null;

      const favorites = customer?.favoriteDishNames ?? profile.hits;
      const items = pickDishesForOrder(dishes, rand, channel, hour, favorites);
      const subtotal = items.reduce(
        (s, it) => s + it.unitPrice * it.quantity,
        0,
      );
      const total = subtotal;

      const isFridayPeak =
        (dow === 'friday' || dow === 'saturday') &&
        hour >= 20 &&
        profile.problems.some((p) => /demora|satura/i.test(p));
      const delayed = isFridayPeak ? chance(rand, 0.35) : chance(rand, 0.08);
      const cancelled = chance(rand, dayOffset === 0 ? 0.04 : 0.06);

      let status: DemoOrderStatus = 'DELIVERED';
      if (cancelled) status = 'CANCELLED';
      else if (dayOffset === 0 && hour >= new Date().getHours() - 1) {
        status = pickOne(rand, [
          'CONFIRMED',
          'PREPARING',
          'READY',
        ] as DemoOrderStatus[]);
      }

      const maxPrep = Math.max(
        ...items.map(
          (it) => dishes.find((d) => d.id === it.dishId)?.prepMinutes ?? 10,
        ),
      );

      orders.push({
        id: slugifyId('ord', profile.slug, orderN),
        dayOffset,
        hour,
        minute,
        channel,
        status,
        customerId: customer?.id ?? null,
        customerName:
          customer?.name ??
          pickOne(rand, FIRST_NAMES) + ' ' + pickOne(rand, LAST_NAMES),
        items,
        subtotal,
        total,
        kitchen: buildKitchen(status, maxPrep, delayed, rand),
        delayed,
        cancelled,
        notes: delayed ? 'Cocina saturada en hora pico' : undefined,
      });
    }
  }

  return orders;
}

function buildTables(profile: StoryProfile): WorldTable[] {
  const tables: WorldTable[] = [];
  let n = 0;
  for (const area of profile.tableLayout?.areas ?? []) {
    for (const capacity of area.tables) {
      n += 1;
      tables.push({
        id: slugifyId('tbl', profile.slug, n),
        area: area.name,
        number: n,
        capacity,
        label: `${area.name} ${n}`,
      });
    }
  }
  return tables;
}

function buildReservations(
  profile: StoryProfile,
  tables: WorldTable[],
  rand: () => number,
): WorldReservation[] {
  if (!tables.length) return [];
  const reservations: WorldReservation[] = [];
  let n = 0;
  for (let dayOffset = 0; dayOffset < 21; dayOffset += 1) {
    const dow = dayOfWeekFromOffset(dayOffset);
    if (profile.hours[dow].closed) continue;
    const count = profile.busyDays.includes(dow)
      ? intBetween(rand, 2, 5)
      : intBetween(rand, 0, 2);
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const table = pickOne(rand, tables);
      const occasions = [
        undefined,
        undefined,
        'Cumpleaños',
        'Aniversario',
        'Reunión',
      ];
      reservations.push({
        id: slugifyId('res', profile.slug, n),
        dayOffset,
        hour: pickOne(rand, [13, 14, 20, 21]),
        minute: pickOne(rand, [0, 15, 30]),
        partySize: Math.min(
          table.capacity,
          intBetween(rand, 2, table.capacity),
        ),
        customerName: `${pickOne(rand, FIRST_NAMES)} ${pickOne(rand, LAST_NAMES)}`,
        tableLabel: table.label,
        occasion: pickOne(rand, occasions),
        status:
          dayOffset === 0
            ? 'CONFIRMED'
            : chance(rand, 0.08)
              ? 'NO_SHOW'
              : 'COMPLETED',
      });
    }
  }
  return reservations;
}

function buildReviews(
  profile: StoryProfile,
  customers: WorldCustomer[],
  rand: () => number,
): WorldReview[] {
  const commentsGood = [
    `La ${profile.hits[0]} está impecable. Volvemos siempre.`,
    'Atención de barrio, sin postureo. Recomendable.',
    'Todo bien caliente y a tiempo. Un placer.',
  ];
  const commentsOk = [
    'Buena comida, un poco de espera el viernes a la noche.',
    'Muy rico, aunque el local estaba lleno y se sintió.',
    'Volvería. El postre podría mejorar un poco.',
  ];
  const commentsMeh = [
    'Estuvo bien, pero esperaba un poco más por el precio.',
    'Demoraron el pedido. La comida sí estuvo bien.',
  ];

  const reviews: WorldReview[] = [];
  for (let i = 0; i < 14; i += 1) {
    const rating = i < 7 ? 5 : i < 11 ? 4 : i < 13 ? 3 : 2;
    const pool =
      rating >= 5 ? commentsGood : rating >= 4 ? commentsOk : commentsMeh;
    const customer = pickOne(rand, customers);
    reviews.push({
      id: slugifyId('rev', profile.slug, i + 1),
      customerName: customer.name,
      rating,
      comment: pickOne(rand, pool),
      dayOffset: intBetween(rand, 1, 45),
      dishName: chance(rand, 0.5) ? pickOne(rand, profile.hits) : undefined,
    });
  }
  return reviews;
}

function buildAnalytics(
  profile: StoryProfile,
  dishes: WorldDish[],
  orders: WorldOrder[],
  reservations: WorldReservation[],
): WorldAnalytics {
  const qty = new Map<
    string,
    { dish: WorldDish; quantity: number; revenue: number }
  >();
  const weekdayOrderCounts: Record<DayOfWeek, number> = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0,
  };

  for (const order of orders) {
    const dow = dayOfWeekFromOffset(order.dayOffset);
    weekdayOrderCounts[dow] += 1;
    if (order.cancelled) continue;
    for (const item of order.items) {
      const dish = dishes.find((d) => d.id === item.dishId);
      if (!dish) continue;
      const cur = qty.get(dish.id) ?? { dish, quantity: 0, revenue: 0 };
      cur.quantity += item.quantity;
      cur.revenue += item.unitPrice * item.quantity;
      qty.set(dish.id, cur);
    }
  }

  const ranked = [...qty.values()].sort((a, b) => b.quantity - a.quantity);
  const topTotal = ranked.slice(0, 5).reduce((s, r) => s + r.quantity, 0) || 1;
  const topDishes = ranked.slice(0, 5).map((r) => ({
    dishId: r.dish.id,
    dishName: r.dish.name,
    categoryName: r.dish.categoryName,
    quantity: r.quantity,
    revenue: r.revenue,
    percentage: Math.round((r.quantity / topTotal) * 100),
  }));

  const todayOrders = orders.filter((o) => o.dayOffset === 0 && !o.cancelled);
  const yesterdayOrders = orders.filter(
    (o) => o.dayOffset === 1 && !o.cancelled,
  );
  const sum = (list: WorldOrder[]) => list.reduce((s, o) => s + o.total, 0);

  const todayRevenue = sum(todayOrders);
  const yesterdayRevenue = sum(yesterdayOrders);
  const todayRes = reservations.filter((r) => r.dayOffset === 0).length;
  const yesterdayRes = reservations.filter((r) => r.dayOffset === 1).length;

  const last30 = orders.filter((o) => o.dayOffset < 30 && !o.cancelled);
  const monthlyOrders = last30.length;
  const avgOrderValue =
    monthlyOrders > 0
      ? Math.round(last30.reduce((s, o) => s + o.total, 0) / monthlyOrders)
      : profile.avgTicket;

  return {
    topDishes,
    todayStats: {
      revenue: todayRevenue,
      orders: todayOrders.length,
      averageOrder: todayOrders.length
        ? Math.round(todayRevenue / todayOrders.length)
        : 0,
      reservations: todayRes,
    },
    yesterdayStats: {
      revenue: yesterdayRevenue,
      orders: yesterdayOrders.length,
      averageOrder: yesterdayOrders.length
        ? Math.round(yesterdayRevenue / yesterdayOrders.length)
        : 0,
      reservations: yesterdayRes,
    },
    weekdayOrderCounts,
    monthlyOrders,
    avgOrderValue,
  };
}

function buildFloor(
  profile: StoryProfile,
  dishes: WorldDish[],
  tables: WorldTable[],
  staff: WorldStaff[],
): OperationalSnapshotFloor {
  const hitDishes = [...dishes].sort((a, b) => b.hitWeight - a.hitWeight);
  const primary = hitDishes[0] ?? dishes[0];
  const secondary = hitDishes[1] ?? dishes[1] ?? primary;
  const tertiary = hitDishes[2] ?? dishes[2] ?? primary;
  const waiter =
    staff.find((s) => s.role === 'WAITER' || s.role === 'CASHIER') ??
    staff.find((s) => s.role === 'MANAGER') ??
    staff[0];
  const opener =
    staff.find((s) => s.role === 'OWNER' || s.role === 'MANAGER') ?? staff[0];

  const openingFloat = 15000;
  const sessionTables = tables.slice(0, 3);
  const openSessions = sessionTables.slice(0, 2).map((table, idx) => {
    const items =
      idx === 0
        ? [
            { dishName: primary.name, quantity: 1, unitPrice: primary.price },
            {
              dishName: secondary.name,
              quantity: 1,
              unitPrice: secondary.price,
            },
          ]
        : [{ dishName: tertiary.name, quantity: 2, unitPrice: tertiary.price }];
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    return {
      id: `floor-open-${profile.slug}-${idx + 1}`,
      tableLabel: table.label,
      tableNumber: table.number,
      guestCount: idx === 0 ? 3 : 2,
      customerName: idx === 0 ? 'Familia Demo' : 'Mesa Demo',
      waiterName: waiter?.name ?? 'Mostrador',
      items,
      subtotal,
      openedAtOffsetMinutes: 35 + idx * 20,
    };
  });

  const fiscalDocuments: OperationalSnapshotFiscalDocument[] = [];
  let numero = 100;
  let cashSales = 0;
  let cardSales = 0;
  let cashCount = 0;
  let cardCount = 0;
  const movements: OperationalSnapshotFloor['cashRegister']['movements'] = [
    {
      id: `floor-mov-${profile.slug}-float`,
      type: 'OPENING_FLOAT',
      amount: openingFloat,
      description: 'Apertura de caja',
      createdAtOffsetMinutes: 240,
    },
  ];

  for (let i = 0; i < 12; i++) {
    numero += 1;
    const dish = hitDishes[i % hitDishes.length] ?? primary;
    const qty = 1 + (i % 2);
    const subtotal = dish.price * qty;
    const ivaAmount = Math.round(subtotal * 0.21);
    const total = subtotal;
    const dayOffset = i < 4 ? 0 : i < 8 ? 1 : 2;
    const hour = 13 + (i % 8);
    const isCash = i % 3 !== 0;
    const paymentMethod = isCash ? 'cash' : 'debit-card';
    if (isCash) {
      cashSales += total;
      cashCount += 1;
    } else {
      cardSales += total;
      cardCount += 1;
    }

    fiscalDocuments.push({
      id: `floor-fiscal-${profile.slug}-${numero}`,
      type: i === 0 ? 'FACTURA_A' : i % 5 === 0 ? 'FACTURA_C' : 'FACTURA_B',
      status: 'AUTHORIZED' as const,
      subtotal,
      ivaAmount,
      total,
      cae: `DEMO-CAE-${profile.slug.slice(0, 4).toUpperCase()}-${numero}`,
      numero,
      puntoVenta: 1,
      customerName: i === 0 ? 'Consumidor Final RI' : undefined,
      dayOffset,
      hour,
      minute: 10 + (i % 40),
    });

    if (dayOffset === 0) {
      movements.push({
        id: `floor-mov-${profile.slug}-${numero}`,
        type: 'SALE',
        amount: total,
        paymentMethod,
        description: `Cobro mesa / ${dish.name}`,
        createdAtOffsetMinutes: 30 + i * 12,
      });
    }
  }

  const expectedCash = openingFloat + cashSales;

  return {
    cashRegister: {
      id: `floor-cash-${profile.slug}`,
      status: 'OPEN',
      level: 'PARTIAL',
      openingFloat,
      expectedCash,
      openedByName: opener?.name ?? profile.ownerName,
      openedAtOffsetMinutes: 240,
      notes: 'Caja parcial demo flagship',
      movements,
      salesByMethod: [
        { paymentMethod: 'cash', total: cashSales, count: cashCount },
        { paymentMethod: 'debit-card', total: cardSales, count: cardCount },
      ],
    },
    openSessions,
    closedSessionCount: fiscalDocuments.length,
    fiscalDocuments,
  };
}

export function buildDemoWorld(profile: StoryProfile): DemoWorld {
  const rand = createPrng(profile.seed);
  const { categories, dishes } = buildMenu(profile);
  const customers = buildCustomers(profile, dishes, rand);
  const orders = buildOrders(profile, dishes, customers, rand);
  const tables = buildTables(profile);
  const reservations = buildReservations(profile, tables, rand);
  const reviews = buildReviews(profile, customers, rand);

  const staff: WorldStaff[] = profile.staff.map((s, i) => ({
    id: slugifyId('staff', profile.slug, i + 1),
    name: s.name,
    role: s.role,
    email: `${s.emailLocal}@${profile.slug}.demo.bentoo`,
  }));

  const promos: WorldPromo[] = profile.promos.map((p, i) => ({
    id: slugifyId('promo', profile.slug, i + 1),
    code: p.code,
    name: p.name,
    description: p.description,
    discountPercent: p.discountPercent,
    daysActive: p.daysActive,
  }));

  const inventory: WorldInventoryItem[] = profile.inventory.map((item, i) => ({
    id: slugifyId('inv', profile.slug, i + 1),
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    lowStockThreshold: item.lowStockThreshold,
    linkedDishNames: item.linkedDishNames ?? [],
  }));

  const suppliers: WorldSupplier[] = profile.suppliers.map((s, i) => ({
    id: slugifyId('sup', profile.slug, i + 1),
    name: s.name,
    category: s.category,
    contact: s.contact,
  }));

  const analytics = buildAnalytics(profile, dishes, orders, reservations);
  const floor = buildFloor(profile, dishes, tables, staff);

  const operationalSnapshot: OperationalSnapshot = {
    version: 1,
    slug: profile.slug,
    generatedAt: new Date().toISOString(),
    orders,
    customers,
    reviews,
    reservations,
    inventory,
    promos,
    staff,
    suppliers,
    tables,
    analytics,
    floor,
  };

  return {
    profile,
    categories,
    dishes,
    customers,
    orders,
    reservations,
    tables,
    reviews,
    staff,
    promos,
    inventory,
    suppliers,
    analytics,
    operationalSnapshot,
  };
}
