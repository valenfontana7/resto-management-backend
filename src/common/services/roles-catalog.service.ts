import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { migrateRestaurantSystemRoles } from '../utils/migrate-system-roles.util';

type Tx = Prisma.TransactionClient;

@Injectable()
export class RolesCatalogService {
  private readonly logger = new Logger(RolesCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Garantiza que el restaurante tenga los 5 roles de sistema con permisos canónicos.
   * Migra nombres legacy (Admin → OWNER, etc.) sin duplicar filas.
   */
  async ensureSystemRoles(restaurantId: string, tx?: Tx): Promise<void> {
    await migrateRestaurantSystemRoles(tx ?? this.prisma, restaurantId);
  }

  /**
   * Resuelve el rol OWNER recién creado (post-registro).
   */
  async getOwnerRoleId(restaurantId: string, tx?: Tx): Promise<string> {
    const client = tx ?? this.prisma;
    const existingOwner = await client.role.findFirst({
      where: { restaurantId, name: 'OWNER' },
      select: { id: true },
    });
    if (existingOwner) {
      return existingOwner.id;
    }

    await this.ensureSystemRoles(restaurantId, tx);
    const owner = await client.role.findFirst({
      where: { restaurantId, name: 'OWNER' },
      select: { id: true },
    });
    if (!owner) {
      throw new Error(`OWNER role missing for restaurant ${restaurantId}`);
    }
    return owner.id;
  }
}
