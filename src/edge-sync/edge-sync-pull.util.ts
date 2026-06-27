import { PrismaService } from '../prisma/prisma.service';

export async function pullMenuStream(
  prisma: PrismaService,
  restaurantId: string,
  since?: string,
) {
  const sinceDate = since ? new Date(since) : null;
  const categories = await prisma.category.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      ...(sinceDate ? { updatedAt: { gte: sinceDate } } : {}),
    },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      order: true,
      updatedAt: true,
      dishes: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          price: true,
          isAvailable: true,
          isAvailableInSalon: true,
          order: true,
          updatedAt: true,
        },
      },
    },
  });

  const latest = categories.reduce<Date | null>((acc, category) => {
    const categoryTs = category.updatedAt;
    let max = acc;
    if (!max || categoryTs > max) max = categoryTs;
    for (const dish of category.dishes) {
      if (!max || dish.updatedAt > max) max = dish.updatedAt;
    }
    return max;
  }, null);

  return {
    items: categories,
    cursor: (latest ?? new Date()).toISOString(),
  };
}

export async function pullTablesStream(
  prisma: PrismaService,
  restaurantId: string,
  since?: string,
) {
  const sinceDate = since ? new Date(since) : null;
  const areas = await prisma.tableArea.findMany({
    where: {
      restaurantId,
      ...(sinceDate ? { updatedAt: { gte: sinceDate } } : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      tables: {
        orderBy: { number: 'asc' },
        select: {
          id: true,
          number: true,
          capacity: true,
          shape: true,
          status: true,
          areaId: true,
          positionX: true,
          positionY: true,
          updatedAt: true,
        },
      },
    },
  });

  const latest = areas.reduce<Date | null>((acc, area) => {
    let max = acc;
    if (!max || area.updatedAt > max) max = area.updatedAt;
    for (const table of area.tables) {
      if (!max || table.updatedAt > max) max = table.updatedAt;
    }
    return max;
  }, null);

  return {
    items: areas,
    cursor: (latest ?? new Date()).toISOString(),
  };
}

export async function pullFloorSessionsStream(
  prisma: PrismaService,
  restaurantId: string,
  since?: string,
) {
  const sinceDate = since ? new Date(since) : null;
  const sessions = await prisma.tableSession.findMany({
    where: {
      restaurantId,
      status: 'OPEN',
      ...(sinceDate ? { openedAt: { gte: sinceDate } } : {}),
    },
    orderBy: { openedAt: 'asc' },
    select: {
      id: true,
      sessionNumber: true,
      status: true,
      tableId: true,
      customerName: true,
      subtotal: true,
      total: true,
      openedAt: true,
      items: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          dishId: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
          notes: true,
          kitchenStatus: true,
          paidInOrderId: true,
        },
      },
    },
  });

  const latest = sessions.reduce<Date | null>(
    (acc, session) => (!acc || session.openedAt > acc ? session.openedAt : acc),
    null,
  );

  return {
    items: sessions,
    cursor: (latest ?? new Date()).toISOString(),
  };
}
