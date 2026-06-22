import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import {
  TableStatus as PrismaTableStatus,
  TableSessionStatus,
  OrderStatus,
} from '@prisma/client';
import {
  CreateTableDto,
  UpdateTableDto,
  TableStatus,
  UpdateTableStatusDto,
  CreateTableAreaDto,
  UpdateTableAreaDto,
  BulkCreateTablesDto,
  BulkDeleteTablesDto,
} from './dto/table.dto';

type TableDeleteBlockReason = 'not_found' | 'busy' | 'open_session';

type TableDeletableCheck =
  | { ok: true }
  | { ok: false; reason: TableDeleteBlockReason };

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async create(
    restaurantId: string,
    userId: string,
    createDto: CreateTableDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    // Verificar que no exista una mesa con ese número
    const existingTable = await this.prisma.table.findUnique({
      where: {
        restaurantId_number: {
          restaurantId,
          number: createDto.number,
        },
      },
    });

    if (existingTable) {
      throw new ConflictException(
        `Table number ${createDto.number} already exists`,
      );
    }

    // Si se proporciona areaId, verificar que existe
    if (createDto.areaId) {
      const area = await this.prisma.tableArea.findFirst({
        where: {
          id: createDto.areaId,
          restaurantId,
        },
      });

      if (!area) {
        throw new NotFoundException(
          `Area with ID ${createDto.areaId} not found`,
        );
      }
    }

    const allowedShapes = ['SQUARE', 'ROUND', 'RECTANGLE'];
    let shapeValue = 'SQUARE';
    if (createDto.shape) {
      shapeValue = String(createDto.shape).toUpperCase();
      if (!allowedShapes.includes(shapeValue)) {
        throw new BadRequestException(
          `Invalid table shape: ${createDto.shape}`,
        );
      }
    }

    const tableData: any = {
      restaurantId,
      number: createDto.number,
      capacity: createDto.capacity,
      shape: shapeValue,
    };

    if (createDto.areaId) {
      tableData.areaId = createDto.areaId;
    }

    if (createDto.position) {
      tableData.positionX = createDto.position.x;
      tableData.positionY = createDto.position.y;
    }

    return this.prisma.table.create({
      data: tableData,
      include: {
        area: true,
      },
    });
  }

  async createBulk(
    restaurantId: string,
    userId: string,
    createDto: BulkCreateTablesDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const area = await this.prisma.tableArea.findFirst({
      where: { id: createDto.areaId, restaurantId },
    });
    if (!area) {
      throw new NotFoundException(`Area with ID ${createDto.areaId} not found`);
    }

    const allowedShapes = ['SQUARE', 'ROUND', 'RECTANGLE'];
    const batchNumbers = createDto.tables.map((table) => table.number);
    const uniqueBatch = new Set(batchNumbers);
    if (uniqueBatch.size !== batchNumbers.length) {
      throw new BadRequestException('Duplicate table numbers in batch');
    }

    const existingTables = await this.prisma.table.findMany({
      where: { restaurantId },
      select: { number: true },
    });
    const existingNumbers = new Set(
      existingTables.map((table) => table.number),
    );

    const skipExisting = createDto.skipExisting !== false;
    const toCreate = skipExisting
      ? createDto.tables.filter((table) => !existingNumbers.has(table.number))
      : createDto.tables;

    if (!skipExisting) {
      const conflicts = createDto.tables.filter((table) =>
        existingNumbers.has(table.number),
      );
      if (conflicts.length > 0) {
        throw new ConflictException(
          `Table numbers already exist: ${conflicts.map((t) => t.number).join(', ')}`,
        );
      }
    }

    if (toCreate.length === 0) {
      return {
        created: 0,
        skipped: createDto.tables.length,
        skippedNumbers: createDto.tables.map((table) => table.number),
      };
    }

    const data = toCreate.map((table) => {
      let shapeValue = 'SQUARE';
      if (table.shape) {
        shapeValue = String(table.shape).toUpperCase();
        if (!allowedShapes.includes(shapeValue)) {
          throw new BadRequestException(`Invalid table shape: ${table.shape}`);
        }
      }

      return {
        restaurantId,
        areaId: createDto.areaId,
        number: table.number,
        capacity: table.capacity,
        shape: shapeValue as 'SQUARE' | 'ROUND' | 'RECTANGLE',
        positionX: table.position?.x ?? 0,
        positionY: table.position?.y ?? 0,
      };
    });

    await this.prisma.table.createMany({ data });

    const skippedNumbers = createDto.tables
      .filter((table) => existingNumbers.has(table.number))
      .map((table) => table.number);

    return {
      created: toCreate.length,
      skipped: skippedNumbers.length,
      skippedNumbers,
    };
  }

  async findAll(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    // Mesas OCCUPIED sin cuenta floor abierta (dato huérfano tras cierres/sync fallidos).
    await this.repairOpenSessionTableLinks(restaurantId, userId);
    await this.reconcileStaleOccupiedStatuses(restaurantId, userId);

    // Obtener todas las áreas con sus mesas
    const areas = await this.prisma.tableArea.findMany({
      where: { restaurantId },
      include: {
        tables: {
          include: {
            currentOrder: {
              include: {
                items: {
                  include: {
                    dish: true,
                  },
                },
              },
            },
            currentReservation: true,
          },
          orderBy: { number: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Obtener mesas sin área
    const tablesWithoutArea = await this.prisma.table.findMany({
      where: {
        restaurantId,
        areaId: null,
      },
      include: {
        currentOrder: {
          include: {
            items: {
              include: {
                dish: true,
              },
            },
          },
        },
        currentReservation: true,
      },
      orderBy: { number: 'asc' },
    });

    // Formatear respuesta
    const formattedAreas = areas.map((area) => ({
      id: area.id,
      name: area.name,
      tables: area.tables.map((table) => this.formatTableResponse(table)),
    }));

    // Si hay mesas sin área, crear un área "General"
    if (tablesWithoutArea.length > 0) {
      formattedAreas.push({
        id: 'no-area',
        name: 'Sin Área',
        tables: tablesWithoutArea.map((table) =>
          this.formatTableResponse(table),
        ),
      });
    }

    return {
      areas: formattedAreas,
    };
  }

  async findOne(id: string, restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const table = await this.prisma.table.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        area: true,
        currentOrder: {
          include: {
            items: {
              include: {
                dish: true,
              },
            },
          },
        },
        currentReservation: true,
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    return this.formatTableResponse(table);
  }

  async update(
    id: string,
    restaurantId: string,
    userId: string,
    updateDto: UpdateTableDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const table = await this.prisma.table.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    // Si se cambia el número, verificar que no exista
    if (updateDto.number && updateDto.number !== table.number) {
      const existingTable = await this.prisma.table.findUnique({
        where: {
          restaurantId_number: {
            restaurantId,
            number: updateDto.number,
          },
        },
      });

      if (existingTable) {
        throw new ConflictException(
          `Table number ${updateDto.number} already exists`,
        );
      }
    }

    // Si se cambia el área, verificar que existe
    if (updateDto.areaId) {
      const area = await this.prisma.tableArea.findFirst({
        where: {
          id: updateDto.areaId,
          restaurantId,
        },
      });

      if (!area) {
        throw new NotFoundException(
          `Area with ID ${updateDto.areaId} not found`,
        );
      }
    }

    const updateData: any = {};

    if (updateDto.number) updateData.number = updateDto.number;
    if (updateDto.capacity) updateData.capacity = updateDto.capacity;
    if (updateDto.shape) {
      const allowedShapes = ['SQUARE', 'ROUND', 'RECTANGLE'];
      const shapeValue = String(updateDto.shape).toUpperCase();
      if (!allowedShapes.includes(shapeValue)) {
        throw new BadRequestException(
          `Invalid table shape: ${updateDto.shape}`,
        );
      }
      updateData.shape = shapeValue;
    }
    if (updateDto.areaId !== undefined) updateData.areaId = updateDto.areaId;
    if (updateDto.position) {
      updateData.positionX = updateDto.position.x;
      updateData.positionY = updateDto.position.y;
    }

    return this.prisma.table.update({
      where: { id },
      data: updateData,
      include: {
        area: true,
      },
    });
  }

  async bulkUpdatePositions(
    restaurantId: string,
    userId: string,
    positions: Array<{ tableId: string; x: number; y: number }>,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    if (!positions.length) {
      return { updated: 0 };
    }

    const ids = [...new Set(positions.map((p) => p.tableId))];
    const tables = await this.prisma.table.findMany({
      where: { restaurantId, id: { in: ids } },
      select: { id: true },
    });
    const validIds = new Set(tables.map((t) => t.id));

    const updates = positions.filter((p) => validIds.has(p.tableId));
    if (!updates.length) {
      return { updated: 0 };
    }

    await this.prisma.$transaction(
      updates.map((p) =>
        this.prisma.table.update({
          where: { id: p.tableId },
          data: {
            positionX: Math.round(p.x),
            positionY: Math.round(p.y),
          },
        }),
      ),
    );

    return { updated: updates.length };
  }

  private async checkTableDeletable(
    tableId: string,
    restaurantId: string,
  ): Promise<TableDeletableCheck> {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, restaurantId },
    });

    if (!table) {
      return { ok: false, reason: 'not_found' };
    }

    if (table.status !== PrismaTableStatus.AVAILABLE) {
      return { ok: false, reason: 'busy' };
    }

    if (table.currentSessionId) {
      return { ok: false, reason: 'open_session' };
    }

    const openSession = await this.prisma.tableSession.findFirst({
      where: {
        tableId: table.id,
        status: { in: ['OPEN', 'CLOSING'] },
      },
    });
    if (openSession) {
      return { ok: false, reason: 'open_session' };
    }

    return { ok: true };
  }

  private deletableErrorMessage(reason: TableDeleteBlockReason): string {
    switch (reason) {
      case 'busy':
        return 'No se puede eliminar una mesa ocupada, reservada o en limpieza';
      case 'open_session':
        return 'No se puede eliminar una mesa con cuenta abierta';
      default:
        return 'Mesa no encontrada';
    }
  }

  private async removeTableRecord(tableId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.tableSession.findMany({
        where: { tableId },
        select: { id: true },
      });
      const sessionIds = sessions.map((session) => session.id);

      if (sessionIds.length > 0) {
        await tx.fiscalDocument.updateMany({
          where: { tableSessionId: { in: sessionIds } },
          data: { tableSessionId: null },
        });
        await tx.cashMovement.updateMany({
          where: { tableSessionId: { in: sessionIds } },
          data: { tableSessionId: null },
        });
        await tx.order.updateMany({
          where: { tableSessionId: { in: sessionIds } },
          data: { tableSessionId: null },
        });
        await tx.tableSession.updateMany({
          where: { id: { in: sessionIds } },
          data: { orderId: null },
        });
        await tx.table.updateMany({
          where: { currentSessionId: { in: sessionIds } },
          data: { currentSessionId: null },
        });
        await tx.tableSession.deleteMany({ where: { tableId } });
      }

      await tx.order.updateMany({
        where: { tableId },
        data: { tableId: null },
      });
      await tx.checkoutSession.updateMany({
        where: { tableId },
        data: { tableId: null },
      });
      await tx.reservation.updateMany({
        where: { tableId },
        data: { tableId: null },
      });
      await tx.table.update({
        where: { id: tableId },
        data: {
          currentOrderId: null,
          currentReservationId: null,
          currentSessionId: null,
        },
      });
      await tx.table.delete({ where: { id: tableId } });
    });
  }

  async delete(id: string, restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const check = await this.checkTableDeletable(id, restaurantId);
    if (!check.ok) {
      if (check.reason === 'not_found') {
        throw new NotFoundException(`Table with ID ${id} not found`);
      }
      throw new BadRequestException(this.deletableErrorMessage(check.reason));
    }

    await this.removeTableRecord(id);

    return { message: 'Table deleted successfully' };
  }

  async deleteBulk(
    restaurantId: string,
    userId: string,
    deleteDto: BulkDeleteTablesDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    if (deleteDto.areaId) {
      const area = await this.prisma.tableArea.findFirst({
        where: { id: deleteDto.areaId, restaurantId },
      });
      if (!area) {
        throw new NotFoundException(
          `Area with ID ${deleteDto.areaId} not found`,
        );
      }
    }

    const where: {
      restaurantId: string;
      areaId?: string;
      id?: { in: string[] };
    } = { restaurantId };

    if (deleteDto.areaId) {
      where.areaId = deleteDto.areaId;
    }
    if (deleteDto.tableIds?.length) {
      where.id = { in: deleteDto.tableIds };
    }

    return this.deleteTablesMatching(restaurantId, where);
  }

  private async deleteTablesMatching(
    restaurantId: string,
    where: { areaId?: string; id?: { in: string[] } },
  ) {
    const tables = await this.prisma.table.findMany({
      where: { restaurantId, ...where },
      select: { id: true, number: true },
      orderBy: { number: 'asc' },
    });

    let deleted = 0;
    const skippedNumbers: string[] = [];

    for (const table of tables) {
      const check = await this.checkTableDeletable(table.id, restaurantId);
      if (!check.ok) {
        skippedNumbers.push(table.number);
        continue;
      }
      await this.removeTableRecord(table.id);
      deleted++;
    }

    return {
      deleted,
      skipped: skippedNumbers.length,
      skippedNumbers,
    };
  }

  async changeStatus(
    id: string,
    restaurantId: string,
    userId: string,
    status: TableStatus,
    statusDto?: UpdateTableStatusDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const table = await this.prisma.table.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    // Validar transiciones de estado
    this.validateStatusTransition(table.status, status);

    const updateData: any = { status };

    // Manejar transiciones específicas
    if (status === TableStatus.OCCUPIED) {
      if (!statusDto?.orderId) {
        throw new BadRequestException(
          'orderId is required when setting status to OCCUPIED',
        );
      }
      updateData.currentOrderId = statusDto.orderId;
      updateData.occupiedSince = new Date();
      updateData.waiter = statusDto.waiter;
      updateData.customerName = statusDto.customerName;
    } else if (status === TableStatus.RESERVED) {
      if (!statusDto?.reservationId) {
        throw new BadRequestException(
          'reservationId is required when setting status to RESERVED',
        );
      }
      updateData.currentReservationId = statusDto.reservationId;
      updateData.customerName = statusDto.customerName;
    } else if (
      status === TableStatus.AVAILABLE ||
      status === TableStatus.CLEANING
    ) {
      // Limpiar datos temporales
      updateData.currentOrderId = null;
      updateData.currentReservationId = null;
      updateData.waiter = null;
      updateData.customerName = null;
      updateData.occupiedSince = null;
    }

    return this.prisma.table.update({
      where: { id },
      data: updateData,
      include: {
        area: true,
        currentOrder: true,
        currentReservation: true,
      },
    });
  }

  // Métodos de áreas
  async createArea(
    restaurantId: string,
    userId: string,
    createDto: CreateTableAreaDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    return this.prisma.tableArea.create({
      data: {
        restaurantId,
        name: createDto.name,
      },
      include: {
        tables: true,
      },
    });
  }

  async findAllAreas(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    return this.prisma.tableArea.findMany({
      where: { restaurantId },
      include: {
        tables: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateArea(
    id: string,
    restaurantId: string,
    userId: string,
    updateDto: UpdateTableAreaDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const area = await this.prisma.tableArea.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!area) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }

    return this.prisma.tableArea.update({
      where: { id },
      data: updateDto,
      include: {
        tables: true,
      },
    });
  }

  async deleteArea(id: string, restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const area = await this.prisma.tableArea.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        tables: { select: { id: true, number: true } },
      },
    });

    if (!area) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }

    const tableResult = await this.deleteTablesMatching(restaurantId, {
      areaId: id,
    });

    const remaining = await this.prisma.table.count({
      where: { restaurantId, areaId: id },
    });

    if (remaining > 0) {
      const blocked = await this.prisma.table.findMany({
        where: { restaurantId, areaId: id },
        select: { number: true },
        orderBy: { number: 'asc' },
      });
      const skippedHint =
        tableResult.skippedNumbers.length > 0
          ? ` Mesas con cuenta abierta u ocupadas: ${tableResult.skippedNumbers.join(', ')}.`
          : '';
      throw new BadRequestException(
        `No se puede eliminar el área «${area.name}»: ${remaining} mesa(s) aún activa(s) (${blocked.map((t) => t.number).join(', ')}).${skippedHint} Liberá o eliminá esas mesas primero.`,
      );
    }

    await this.prisma.tableArea.delete({
      where: { id },
    });

    return {
      message: 'Area deleted successfully',
      areaName: area.name,
      deletedTables: tableResult.deleted,
      skippedTables: tableResult.skipped,
      skippedNumbers: tableResult.skippedNumbers,
    };
  }

  // Estadísticas
  async getStats(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const tables = await this.prisma.table.findMany({
      where: { restaurantId },
      include: {
        currentOrder: {
          include: {
            items: true,
          },
        },
      },
    });

    const stats = {
      total: tables.length,
      available: 0,
      occupied: 0,
      reserved: 0,
      cleaning: 0,
      occupancyRate: 0,
      totalRevenue: 0,
    };

    tables.forEach((table) => {
      stats[table.status.toLowerCase()]++;
      if (table.currentOrder) {
        stats.totalRevenue += table.currentOrder.total;
      }
    });

    stats.occupancyRate =
      stats.total > 0
        ? Number(((stats.occupied / stats.total) * 100).toFixed(1))
        : 0;

    return stats;
  }

  // Helpers privados
  private validateStatusTransition(
    currentStatus: PrismaTableStatus,
    newStatus: TableStatus,
  ) {
    const validTransitions = {
      [TableStatus.AVAILABLE]: [
        TableStatus.OCCUPIED,
        TableStatus.RESERVED,
        TableStatus.CLEANING,
      ],
      [TableStatus.OCCUPIED]: [TableStatus.CLEANING, TableStatus.AVAILABLE],
      [TableStatus.RESERVED]: [TableStatus.OCCUPIED, TableStatus.AVAILABLE],
      [TableStatus.CLEANING]: [TableStatus.AVAILABLE],
    };

    const currentKey = currentStatus as unknown as TableStatus;
    if (!validTransitions[currentKey]?.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  async repairOpenSessionTableLinks(
    restaurantId: string,
    userId: string,
  ): Promise<number> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const openSessions = await this.prisma.tableSession.findMany({
      where: { restaurantId, status: TableSessionStatus.OPEN },
      select: { id: true, tableId: true },
    });

    let repaired = 0;
    for (const session of openSessions) {
      const result = await this.prisma.table.updateMany({
        where: { id: session.tableId, restaurantId },
        data: {
          status: PrismaTableStatus.OCCUPIED,
          currentSessionId: session.id,
        },
      });
      repaired += result.count;
    }

    return repaired;
  }

  async reconcileStaleOccupiedStatuses(
    restaurantId: string,
    userId: string,
  ): Promise<number> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const openSessions = await this.prisma.tableSession.findMany({
      where: { restaurantId, status: TableSessionStatus.OPEN },
      select: { tableId: true },
    });
    const openTableIds = openSessions.map((s) => s.tableId);

    const activeFloorOrders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        tableId: { not: null },
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.PAID,
            OrderStatus.CONFIRMED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
          ],
        },
        OR: [
          { tableSessionId: { not: null } },
          { orderSource: { in: ['FLOOR_COMANDA', 'FLOOR_FINAL'] } },
        ],
      },
      select: { tableId: true },
    });

    const protectedTableIds = [
      ...new Set([
        ...openTableIds,
        ...activeFloorOrders
          .map((o) => o.tableId)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];

    const result = await this.prisma.table.updateMany({
      where: {
        restaurantId,
        status: PrismaTableStatus.OCCUPIED,
        currentSessionId: null,
        currentOrderId: null,
        ...(protectedTableIds.length > 0
          ? { id: { notIn: protectedTableIds } }
          : {}),
      },
      data: {
        status: PrismaTableStatus.AVAILABLE,
        waiter: null,
        customerName: null,
        occupiedSince: null,
      },
    });

    return result.count;
  }

  private formatTableResponse(table: any) {
    return {
      id: table.id,
      number: table.number,
      capacity: table.capacity,
      status: table.status,
      shape: table.shape,
      position: {
        x: table.positionX,
        y: table.positionY,
      },
      areaId: table.areaId,
      waiter: table.waiter,
      customerName: table.customerName,
      occupiedSince: table.occupiedSince,
      orderValue: table.currentOrder?.total,
      orderId: table.currentOrder?.id,
      reservationTime: table.currentReservation?.time,
      reservationId: table.currentReservation?.id,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    };
  }
}
