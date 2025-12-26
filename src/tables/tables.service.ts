import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TableStatus as PrismaTableStatus } from '@prisma/client';
import {
  CreateTableDto,
  UpdateTableDto,
  TableStatus,
  UpdateTableStatusDto,
  CreateTableAreaDto,
  UpdateTableAreaDto,
} from './dto/table.dto';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async create(
    restaurantId: string,
    userId: string,
    createDto: CreateTableDto,
  ) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

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

  async findAll(restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

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
    await this.verifyRestaurantOwnership(restaurantId, userId);

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
    await this.verifyRestaurantOwnership(restaurantId, userId);

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

  async delete(id: string, restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const table = await this.prisma.table.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    // Solo permitir eliminar si está disponible
    if (table.status !== TableStatus.AVAILABLE) {
      throw new BadRequestException(
        'Cannot delete table that is occupied, reserved, or being cleaned',
      );
    }

    await this.prisma.table.delete({
      where: { id },
    });

    return { message: 'Table deleted successfully' };
  }

  async changeStatus(
    id: string,
    restaurantId: string,
    userId: string,
    status: TableStatus,
    statusDto?: UpdateTableStatusDto,
  ) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

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
    await this.verifyRestaurantOwnership(restaurantId, userId);

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
    await this.verifyRestaurantOwnership(restaurantId, userId);

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
    await this.verifyRestaurantOwnership(restaurantId, userId);

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
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const area = await this.prisma.tableArea.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        tables: true,
      },
    });

    if (!area) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }

    if (area.tables.length > 0) {
      throw new BadRequestException(
        'Cannot delete area that contains tables. Move or delete tables first.',
      );
    }

    await this.prisma.tableArea.delete({
      where: { id },
    });

    return { message: 'Area deleted successfully' };
  }

  // Estadísticas
  async getStats(restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

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

  private async verifyRestaurantOwnership(
    restaurantId: string,
    userId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }
  }
}
