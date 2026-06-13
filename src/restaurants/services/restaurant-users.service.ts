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
   * Obtener todos los usuarios de un restaurante.
   * Incluye tanto a quienes lo tienen como restaurante activo como a quienes
   * fueron vinculados vía membership (multi-cuenta por usuario).
   */
  async getRestaurantUsers(restaurantId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [{ restaurantId }, { memberships: { some: { restaurantId } } }],
      },
      select: {
        id: true,
        email: true,
        name: true,
        lastLogin: true,
        roleId: true,
        restaurantId: true,
        role: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        memberships: {
          where: { restaurantId },
          select: {
            roleId: true,
            role: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Para usuarios cuyo restaurante activo es este, usar su rol directo;
    // para los vinculados vía membership, usar el rol del membership.
    return users.map((user) => {
      const membershipRole = user.memberships[0]?.role ?? null;
      const effectiveRole =
        user.restaurantId === restaurantId ? user.role : membershipRole;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        lastLogin: user.lastLogin,
        roleId: effectiveRole?.id ?? null,
        role: effectiveRole,
        isActive: user.isActive,
        createdAt: user.createdAt,
        roleName: effectiveRole?.name || null,
      };
    });
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
    const normalizedEmail = inviteDto.email.trim().toLowerCase();

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

    // El login usa email como identificador global. Un email ya registrado se
    // vincula al restaurante vía membership (multi-cuenta por usuario) en lugar
    // de bloquearse o duplicar la identidad.
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        restaurantId: true,
      },
    });

    if (existingUser) {
      const alreadyMember =
        existingUser.restaurantId === restaurantId ||
        (await this.prisma.restaurantMembership.findUnique({
          where: {
            userId_restaurantId: { userId: existingUser.id, restaurantId },
          },
          select: { id: true },
        })) !== null;

      if (alreadyMember) {
        throw new ConflictException('User already exists in this restaurant');
      }

      // Vincular el usuario existente a este restaurante. No se crea un usuario
      // nuevo ni se pide activación: ya tiene credenciales. Podrá cambiar a este
      // restaurante desde su selector de cuentas.
      await this.prisma.restaurantMembership.create({
        data: {
          userId: existingUser.id,
          restaurantId,
          roleId: role.id,
          isDefault: false,
        },
      });

      void this.adminAlerts?.notifyUserRegistered({
        source: 'restaurants.invite-user.link-existing',
        userId: existingUser.id,
        name: existingUser.name ?? normalizedEmail,
        email: normalizedEmail,
        restaurantId,
        restaurantName: null,
      });

      return {
        id: existingUser.id,
        name: existingUser.name ?? normalizedEmail.split('@')[0],
        email: normalizedEmail,
        isActive: true,
        createdAt: new Date(),
        linkedExisting: true,
        activationCode: null,
        activationCodeExpiresAt: null,
        activationCodeEmailSent: false,
      };
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
        name: inviteDto.name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
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
    // El usuario debe tener acceso a este restaurante (activo o vía membership)
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        OR: [{ restaurantId }, { memberships: { some: { restaurantId } } }],
      },
      select: { id: true, restaurantId: true },
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

    // Usuario vinculado (su restaurante activo es otro): el rol vive en el
    // membership y no se toca su estado global ni su identidad.
    if (user.restaurantId !== restaurantId) {
      const membership = await this.prisma.restaurantMembership.update({
        where: { userId_restaurantId: { userId, restaurantId } },
        data: {
          ...(updateDto.roleId ? { roleId: updateDto.roleId } : {}),
        },
        select: {
          roleId: true,
          role: { select: { id: true, name: true, color: true } },
        },
      });

      const linkedUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
        },
      });

      return {
        id: userId,
        email: linkedUser?.email ?? '',
        name: linkedUser?.name ?? '',
        roleId: membership.roleId,
        role: membership.role,
        isActive: linkedUser?.isActive ?? true,
        createdAt: linkedUser?.createdAt ?? new Date(),
      };
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
   * Eliminar usuario del restaurante.
   * En multi-cuenta: si el usuario tiene acceso a otros restaurantes, solo se
   * desvincula de este (no se borra su identidad); si es su único restaurante,
   * se elimina por completo (comportamiento histórico).
   */
  async removeUser(restaurantId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, restaurantId: true },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    const membership = await this.prisma.restaurantMembership.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
      select: { id: true },
    });
    const isActiveHere = user.restaurantId === restaurantId;

    if (!membership && !isActiveHere) {
      throw new NotFoundException('User not found in this restaurant');
    }

    const otherMemberships = await this.prisma.restaurantMembership.findMany({
      where: { userId, NOT: { restaurantId } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { restaurantId: true, roleId: true },
    });

    // Tiene otras cuentas: solo desvincular de este restaurante.
    if (otherMemberships.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.restaurantMembership.deleteMany({
          where: { userId, restaurantId },
        });

        // Si su restaurante activo era este, mover el activo a otra cuenta.
        if (isActiveHere) {
          const next = otherMemberships[0];
          await tx.user.update({
            where: { id: userId },
            data: {
              restaurantId: next.restaurantId,
              roleId: next.roleId ?? null,
            },
          });
        }
      });

      return { success: true, message: 'User unlinked successfully' };
    }

    // Único restaurante del usuario: borrado físico (histórico).
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
