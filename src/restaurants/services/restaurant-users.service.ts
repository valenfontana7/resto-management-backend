import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAlertsService } from '../../admin-alerts/admin-alerts.service';
import { EmailService } from '../../email/email.service';

/**
 * Servicio para gestión de usuarios de restaurante.
 * Extraído de RestaurantsService para cumplir con SRP (SOLID).
 */
@Injectable()
export class RestaurantUsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly adminAlerts?: AdminAlertsService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  /**
   * Obtener roles con permisos para un restaurante
   */
  async getRoles(restaurantId: string) {
    return this.prisma.role.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        permissions: true,
        color: true,
        isSystemRole: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Obtener todos los usuarios de un restaurante
   */
  async getRestaurantUsers(restaurantId: string) {
    const users = await this.prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        email: true,
        name: true,
        lastLogin: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aplanar roleName para el frontend
    return users.map((user) => ({
      ...user,
      roleName: user.role?.name || null,
    }));
  }

  /**
   * Invitar un usuario a un restaurante
   * TODO: Implementar sistema de invitaciones con email y expiración
   */
  async inviteUser(
    restaurantId: string,
    inviteDto: {
      email: string;
      roleId?: string;
      roleName?: string;
      name?: string;
    },
  ) {
    const roleIdentifier = inviteDto.roleId || inviteDto.roleName;

    if (!roleIdentifier) {
      throw new BadRequestException('Either roleId or role name is required');
    }

    // Buscar rol
    const role = await this.findRole(restaurantId, roleIdentifier);

    if (!role) {
      throw new NotFoundException(
        `Role '${roleIdentifier}' not found in this restaurant`,
      );
    }

    // Verificar que el rol pertenece al restaurante
    if (role.restaurantId !== restaurantId) {
      throw new BadRequestException('Invalid role for this restaurant');
    }

    // Verificar si el usuario ya existe en el restaurante
    const existingUser = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        email: inviteDto.email,
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists in this restaurant');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });

    // Crear usuario con contraseña temporal
    const temporaryPassword = randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const activationCode = this.generateActivationCode();
    const activationCodeHash = await bcrypt.hash(activationCode, 10);
    const activationCodeExpiresAt = new Date();
    activationCodeExpiresAt.setHours(activationCodeExpiresAt.getHours() + 48);

    const createdUser = await this.prisma.user.create({
      data: {
        name: inviteDto.name || inviteDto.email.split('@')[0],
        email: inviteDto.email,
        password: hashedPassword,
        restaurantId,
        roleId: role.id,
        isActive: true,
        passwordSetupRequired: true,
        activationCodeHash,
        activationCodeExpiresAt,
        activationCodeAttempts: 0,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    });

    void this.adminAlerts?.notifyUserRegistered({
      source: 'restaurants.invite-user',
      userId: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      restaurantId,
      restaurantName: null,
    });

    const activationCodeEmailSent = await this.sendActivationCodeEmail({
      to: createdUser.email,
      name: createdUser.name,
      restaurantName: restaurant?.name ?? 'tu restaurante',
      activationCode,
      activationCodeExpiresAt,
    });

    return {
      ...createdUser,
      activationCode,
      activationCodeExpiresAt,
      activationCodeEmailSent,
    };
  }

  /**
   * Actualizar rol y estado de un usuario
   */
  async updateUserRole(
    restaurantId: string,
    userId: string,
    updateDto: { roleId?: string; isActive?: boolean },
  ) {
    // Verificar que el usuario pertenece al restaurante
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    // Si se actualiza el rol, verificar que pertenece al restaurante
    if (updateDto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: updateDto.roleId },
      });

      if (!role || role.restaurantId !== restaurantId) {
        throw new BadRequestException('Invalid role for this restaurant');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        roleId: updateDto.roleId,
        isActive: updateDto.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Eliminar usuario del restaurante (hard delete)
   */
  async removeUser(restaurantId: string, userId: string) {
    // Verificar que el usuario pertenece al restaurante
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    await this.prisma.$transaction(async (tx) => {
      // AdminAuditLog no tiene onDelete: Cascade para User.
      await tx.adminAuditLog.deleteMany({
        where: { adminId: userId },
      });

      await tx.user.delete({
        where: { id: userId },
      });
    });

    return { success: true, message: 'User removed successfully' };
  }

  /**
   * Asociar un usuario existente con un restaurante
   */
  async associateUserWithRestaurant(userId: string, restaurantId: string) {
    // Verificar que el restaurante existe
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    // Actualizar el usuario con el restaurantId
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { restaurantId },
      select: {
        id: true,
        email: true,
        restaurantId: true,
      },
    });

    // También conectar en la relación many-to-many
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        users: {
          connect: { id: userId },
        },
      },
    });

    return updatedUser;
  }

  // ─── Métodos privados ───────────────────────────────────────────────

  private async findRole(restaurantId: string, roleIdentifier: string) {
    // Intentar buscar por ID primero
    let role = await this.prisma.role.findUnique({
      where: { id: roleIdentifier },
    });

    // Si no se encuentra por ID, buscar por nombre (case-insensitive)
    if (!role) {
      role = await this.prisma.role.findFirst({
        where: {
          restaurantId,
          name: {
            equals: roleIdentifier,
            mode: 'insensitive',
          },
        },
      });

      // Si aún no se encuentra, probar versión capitalizada
      if (!role && roleIdentifier.length > 0) {
        const capitalizedName =
          roleIdentifier.charAt(0).toUpperCase() +
          roleIdentifier.slice(1).toLowerCase();
        role = await this.prisma.role.findFirst({
          where: {
            restaurantId,
            name: capitalizedName,
          },
        });
      }
    }

    return role;
  }

  private generateActivationCode() {
    const value = randomBytes(4).readUInt32BE(0) % 1_000_000;
    return value.toString().padStart(6, '0');
  }

  private async sendActivationCodeEmail(params: {
    to: string;
    name: string;
    restaurantName: string;
    activationCode: string;
    activationCodeExpiresAt: Date;
  }): Promise<boolean> {
    if (!this.emailService) return false;

    const formattedCode = params.activationCode.replace(
      /(\d{3})(\d{3})/,
      '$1-$2',
    );
    const expiresAt = params.activationCodeExpiresAt.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const safeName = this.escapeHtml(params.name);
    const safeRestaurantName = this.escapeHtml(params.restaurantName);

    return this.emailService.sendGenericEmail(
      params.to,
      `Tu codigo de activacion para ${safeRestaurantName}`,
      `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">Hola ${safeName}</h2>
          <p>Te crearon un acceso al panel de <strong>${safeRestaurantName}</strong>.</p>
          <p>Usa este codigo en el primer ingreso para crear tu contrasena:</p>
          <div style="font-size: 30px; font-weight: 700; letter-spacing: 6px; padding: 16px 20px; background: #f1f5f9; border-radius: 8px; display: inline-block;">
            ${formattedCode}
          </div>
          <p style="margin-top: 18px; color: #475569;">El codigo vence el ${expiresAt} y solo puede usarse una vez.</p>
          <p style="color: #64748b; font-size: 13px;">Si no esperabas este acceso, ignora este email.</p>
        </div>
      `,
      'Bentoo',
    );
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
