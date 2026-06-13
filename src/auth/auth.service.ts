import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  LoginIntentDto,
  CompletePasswordSetupDto,
  RequestMagicLinkDto,
  RegisterMagicLinkDto,
  ConsumeMagicLinkDto,
} from './dto/auth.dto';
import { User } from '@prisma/client';
import { AdminAlertsService } from '../admin-alerts/admin-alerts.service';
import { EmailService } from '../email/email.service';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  roleId: string | null;
  restaurantId: string | null;
  roleName?: string | null;
  restaurantSlug?: string | null;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    roleId: string | null;
    restaurantId: string | null;
    roleName?: string | null;
    restaurantSlug?: string | null;
  };
  token: string;
  expiresAt: string;
  needsSetup?: boolean;
}

export interface LoginIntentResponse {
  mode: 'password' | 'password_setup';
  email: string;
  name?: string;
}

export interface MagicLinkRequestResponse {
  sent: true;
  expiresInMinutes: number;
  devLink?: string;
}

const MAGIC_LINK_EXPIRY_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Optional() private readonly adminAlerts?: AdminAlertsService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashLoginToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getFrontendUrl(): string {
    return (
      process.env.FRONTEND_URL?.trim().replace(/\/$/, '') ||
      process.env.BASE_URL?.trim().replace(/\/$/, '') ||
      'http://localhost:3000'
    );
  }

  private normalizeRedirect(redirect?: string): string {
    if (!redirect) return '/admin';

    const trimmed = redirect.trim();
    if (!trimmed.startsWith('/')) return '/admin';
    if (trimmed.startsWith('//')) return '/admin';

    const normalizedPath =
      (trimmed.split(/[?#]/, 1)[0] || '/').replace(/\/+$/, '') || '/';
    if (
      normalizedPath === '/admin/login' ||
      normalizedPath === '/admin/register' ||
      normalizedPath === '/admin/magic-link'
    ) {
      return '/admin';
    }

    return trimmed;
  }

  private buildMagicLink(token: string, redirect?: string): string {
    const url = new URL('/admin/magic-link', this.getFrontendUrl());
    url.searchParams.set('token', token);
    url.searchParams.set('redirect', this.normalizeRedirect(redirect));
    return url.toString();
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    // Verificar si el email ya existe
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Si se proporciona nombre de restaurante, verificar que no exista
    let slug: string | undefined;
    if (dto.restaurantName) {
      slug = this.generateSlug(dto.restaurantName);
      const existingRestaurant = await this.prisma.restaurant.findUnique({
        where: { slug },
      });

      if (existingRestaurant) {
        throw new ConflictException('Restaurant name already taken');
      }
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Si NO se proporciona restaurantName, crear solo el usuario
    if (!dto.restaurantName) {
      const user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: dto.name,
          isActive: true,
          // No tiene restaurante ni rol por ahora
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      void this.adminAlerts?.notifyUserRegistered({
        source: 'auth.register',
        userId: user.id,
        name: user.name,
        email: user.email,
        restaurantId: null,
        restaurantName: null,
      });

      // Use generateAuthResponse to include proper claims (roleName, restaurantSlug)
      return await this.generateAuthResponse(user as any);
    }

    // Crear restaurante con roles del sistema y usuario admin en una transacción
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Crear restaurante
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.restaurantName as string,
          slug: slug as string,
          type: 'restaurant',
          cuisineTypes: [],
          email: normalizedEmail,
          phone: '',
          address: '',
          city: '',
          country: '',
          onboardingIncomplete: true,
        },
      });

      // 2. Crear roles del sistema
      const adminRole = await tx.role.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Admin',
          permissions: ['all'],
          color: '#ef4444',
          isSystemRole: true,
        },
      });

      await tx.role.createMany({
        data: [
          {
            restaurantId: restaurant.id,
            name: 'Manager',
            permissions: [
              'dashboard',
              'menu',
              'orders',
              'reservations',
              'tables',
              'reports',
              'analytics',
              'kitchen',
              'delivery',
              'settings',
            ],
            color: '#f59e0b',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Waiter',
            permissions: ['orders', 'tables'],
            color: '#3b82f6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Kitchen',
            permissions: ['orders', 'kitchen'],
            color: '#8b5cf6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Delivery',
            permissions: ['orders', 'delivery'],
            color: '#10b981',
            isSystemRole: true,
          },
        ],
      });

      // 3. Crear usuario con rol Admin
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: dto.name,
          restaurantId: restaurant.id,
          roleId: adminRole.id,
        },
      });

      return { user, restaurant };
    });

    void this.adminAlerts?.notifyUserRegistered({
      source: 'auth.register',
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      restaurantId: result.restaurant.id,
      restaurantName: result.restaurant.name,
    });

    void this.adminAlerts?.notifyRestaurantCreated({
      source: 'auth.register',
      restaurantId: result.restaurant.id,
      restaurantName: result.restaurant.name,
      restaurantSlug: result.restaurant.slug,
      ownerEmail: result.user.email,
    });

    return await this.generateAuthResponse(result.user);
  }

  async getLoginIntent(dto: LoginIntentDto): Promise<LoginIntentResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      select: {
        email: true,
        name: true,
        isActive: true,
        passwordSetupRequired: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const hasConfiguredActiveUser = users.some(
      (user) => user.isActive && !user.passwordSetupRequired,
    );

    if (hasConfiguredActiveUser) {
      return { mode: 'password', email: normalizedEmail };
    }

    const pendingUser = users.find(
      (user) => user.isActive && user.passwordSetupRequired,
    );

    if (!pendingUser) {
      return { mode: 'password', email: normalizedEmail };
    }

    return {
      mode: 'password_setup',
      email: normalizedEmail,
      name: pendingUser.name,
    };
  }

  async registerWithMagicLink(
    dto: RegisterMagicLinkDto,
  ): Promise<MagicLinkRequestResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Name is required');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!existing) {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      const created = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name,
          isActive: true,
          passwordSetupRequired: false,
        },
      });

      void this.adminAlerts?.notifyUserRegistered({
        source: 'auth.register-magic-link',
        userId: created.id,
        name: created.name,
        email: created.email,
        restaurantId: null,
        restaurantName: null,
      });
    } else if (!existing.isActive || existing.passwordSetupRequired) {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          passwordSetupRequired: false,
          password: hashedPassword,
          name: existing.name || name,
        },
      });
    }

    return this.requestMagicLink({
      email: normalizedEmail,
      redirect: dto.redirect,
    });
  }

  async requestMagicLink(
    dto: RequestMagicLinkDto,
  ): Promise<MagicLinkRequestResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const response: MagicLinkRequestResponse = {
      sent: true,
      expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
    };

    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        isActive: true,
        passwordSetupRequired: false,
        deletedAt: null,
      },
      include: {
        restaurant: true,
        role: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!user) {
      return response;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashLoginToken(rawToken);
    const expiresAt = new Date(
      Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.authLoginLink.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.authLoginLink.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const link = this.buildMagicLink(rawToken, dto.redirect);
    const html = this.renderMagicLinkEmail({
      name: user.name,
      link,
      expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
    });

    await this.emailService?.sendGenericEmail(
      user.email,
      'Tu link de acceso a Bentoo',
      html,
      'Bentoo',
    );

    if (process.env.NODE_ENV !== 'production') {
      response.devLink = link;
    }

    return response;
  }

  async consumeMagicLink(dto: ConsumeMagicLinkDto): Promise<AuthResponse> {
    const token = dto.token?.trim();
    if (!token || token.length < 24) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    const tokenHash = this.hashLoginToken(token);
    const link = await this.prisma.authLoginLink.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            restaurant: {
              include: {
                hours: true,
              },
            },
            role: true,
          },
        },
      },
    });

    const now = new Date();
    if (
      !link ||
      link.usedAt ||
      link.expiresAt.getTime() < now.getTime() ||
      !link.user.isActive ||
      link.user.deletedAt ||
      link.user.passwordSetupRequired
    ) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authLoginLink.updateMany({
        where: {
          id: link.id,
          usedAt: null,
          expiresAt: { gte: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired magic link');
      }

      return tx.user.update({
        where: { id: link.userId },
        data: { lastLogin: now },
        include: {
          restaurant: {
            include: {
              hours: true,
            },
          },
          role: true,
        },
      });
    });

    return await this.generateAuthResponse(updatedUser as User);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      include: {
        restaurant: {
          include: {
            hours: true,
          },
        },
        role: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activeUsers = users.filter((user) => user.isActive);
    const configuredActiveUsers = activeUsers.filter(
      (user) => !user.passwordSetupRequired,
    );

    for (const candidate of configuredActiveUsers) {
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        candidate.password,
      );

      if (!isPasswordValid) {
        continue;
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: candidate.id },
        data: { lastLogin: new Date() },
        include: {
          restaurant: {
            include: {
              hours: true,
            },
          },
          role: true,
        },
      });

      return await this.generateAuthResponse(updatedUser as User);
    }

    if (configuredActiveUsers.length === 0) {
      if (activeUsers.some((user) => user.passwordSetupRequired)) {
        throw new UnauthorizedException('Password setup required');
      }

      if (users.some((user) => !user.isActive)) {
        throw new UnauthorizedException('User account is inactive');
      }
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async completePasswordSetup(
    dto: CompletePasswordSetupDto,
  ): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activePendingUsers = users.filter(
      (user) => user.isActive && user.passwordSetupRequired,
    );

    if (activePendingUsers.length === 0) {
      if (users.some((user) => !user.isActive)) {
        throw new UnauthorizedException('User account is inactive');
      }

      throw new BadRequestException('Password already configured');
    }

    const primaryPendingUser = activePendingUsers[0];

    if (
      !primaryPendingUser.activationCodeHash ||
      !primaryPendingUser.activationCodeExpiresAt
    ) {
      throw new BadRequestException('Activation code is not available');
    }

    if (primaryPendingUser.activationCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Activation code expired');
    }

    if (primaryPendingUser.activationCodeAttempts >= 5) {
      throw new BadRequestException('Activation code locked');
    }

    let matchedPendingUser: (typeof activePendingUsers)[number] | null = null;

    for (const candidate of activePendingUsers) {
      if (
        !candidate.activationCodeHash ||
        !candidate.activationCodeExpiresAt ||
        candidate.activationCodeAttempts >= 5 ||
        candidate.activationCodeExpiresAt.getTime() < Date.now()
      ) {
        continue;
      }

      const isActivationCodeValid = await bcrypt.compare(
        dto.activationCode,
        candidate.activationCodeHash,
      );

      if (!isActivationCodeValid) {
        continue;
      }

      matchedPendingUser = candidate;
      break;
    }

    if (!matchedPendingUser) {
      await this.prisma.user.update({
        where: { id: primaryPendingUser.id },
        data: { activationCodeAttempts: { increment: 1 } },
      });

      throw new UnauthorizedException('Invalid activation code');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const updatedUser = await this.prisma.user.update({
      where: { id: matchedPendingUser.id },
      data: {
        password: hashedPassword,
        passwordSetupRequired: false,
        activationCodeHash: null,
        activationCodeExpiresAt: null,
        activationCodeAttempts: 0,
        lastLogin: new Date(),
      },
      include: {
        restaurant: {
          include: {
            hours: true,
          },
        },
        role: true,
      },
    });

    return await this.generateAuthResponse(updatedUser as User);
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        restaurant: true,
        role: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
            color: true,
          },
        },
        restaurantId: true,
        restaurant: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return { user };
  }

  private mapRoleForResponse(
    role: { id: string; name: string; permissions: any; color: string } | null,
  ) {
    if (!role) return null;
    const roleCode = this.mapRoleNameToCode(role.name);
    if (roleCode) return roleCode;

    return {
      id: role.id,
      name: role.name,
      permissions: this.normalizePermissions(
        this.coercePermissions(role.permissions),
      ),
      color: role.color,
    };
  }

  private coercePermissions(permissions: any): string[] {
    if (!permissions) return [];
    if (Array.isArray(permissions)) {
      return permissions.filter((p) => typeof p === 'string');
    }
    if (typeof permissions === 'string') return [permissions];
    return [];
  }

  private mapRoleNameToCode(roleName?: string | null): string | null {
    if (!roleName) return null;
    const normalized = roleName.trim().toUpperCase();

    const map: Record<string, string> = {
      SUPER_ADMIN: 'SUPER_ADMIN',
      OWNER: 'OWNER',
      ADMIN: 'ADMIN',
      MANAGER: 'MANAGER',
      WAITER: 'WAITER',
      CHEF: 'CHEF',
      KITCHEN: 'KITCHEN',
      DELIVERY: 'DELIVERY',
    };

    if (map[normalized]) return map[normalized];

    const friendlyMap: Record<string, string> = {
      ADMINISTRATOR: 'ADMIN',
      ADMINISTRADOR: 'ADMIN',
      GERENTE: 'MANAGER',
      MOZO: 'WAITER',
      COCINA: 'KITCHEN',
      REPARTO: 'DELIVERY',
      REPARTIDOR: 'DELIVERY',
    };

    return friendlyMap[normalized] || null;
  }

  private normalizePermissions(permissions: string[]) {
    if (permissions.includes('all')) return ['all'];

    const mapping: Record<string, string[]> = {
      manage_menu: ['menu'],
      manage_orders: ['orders'],
      view_orders: ['orders'],
      update_order_status: ['orders', 'kitchen'],
      view_reports: ['reports'],
      manage_tables: ['tables'],
      view_tables: ['tables'],
      manage_reservations: ['reservations'],
      take_orders: ['orders'],
      view_delivery_orders: ['delivery', 'orders'],
      update_delivery_status: ['delivery'],
      manage_payments: ['billing'],
    };

    const allowed = new Set([
      'orders',
      'reservations',
      'menu',
      'reports',
      'tables',
      'kitchen',
      'delivery',
      'promotions',
      'analytics',
      'settings',
      'billing',
      'branding',
      'dashboard',
    ]);

    const normalized = new Set<string>();
    for (const perm of permissions) {
      if (allowed.has(perm)) {
        normalized.add(perm);
        continue;
      }
      const mapped = mapping[perm] || [];
      for (const p of mapped) {
        if (allowed.has(p)) normalized.add(p);
      }
    }

    return Array.from(normalized);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private renderMagicLinkEmail(params: {
    name: string;
    link: string;
    expiresInMinutes: number;
  }): string {
    const safeName = this.escapeHtml(params.name || 'Hola');
    const safeLink = this.escapeHtml(params.link);

    return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Acceso a Bentoo</title>
        </head>
        <body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
                  <tr>
                    <td style="padding:32px;background:#071316;color:#ffffff;">
                      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#99f6e4;">Bentoo</p>
                      <h1 style="margin:0;font-size:26px;line-height:1.2;">Entrar a tu panel</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${safeName},</p>
                      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
                        Recibimos una solicitud para entrar a tu panel de Bentoo sin contraseña.
                        Este link vence en ${params.expiresInMinutes} minutos y se puede usar una sola vez.
                      </p>
                      <p style="margin:0 0 28px;text-align:center;">
                        <a href="${safeLink}" style="display:inline-block;border-radius:12px;background:#14b8a6;color:#042f2e;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;">
                          Entrar al panel
                        </a>
                      </p>
                      <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#64748b;">
                        Si el boton no funciona, copia y pega este enlace en tu navegador:
                      </p>
                      <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;color:#0f766e;">${safeLink}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                      <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                        Si no pediste este acceso, podes ignorar este email. Tu cuenta sigue protegida.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  async generateAuthResponse(user: User): Promise<AuthResponse> {
    // Ensure role and restaurant relations are present
    let fullUser: any = user;
    if (!user || !('role' in user) || !('restaurant' in user)) {
      fullUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: { role: true, restaurant: true },
      });
      if (!fullUser) {
        throw new UnauthorizedException('User not found');
      }
    }

    // Backfill perezoso: registrar el restaurante activo como membership para
    // que el usuario pueda cambiar entre cuentas sin migraciones adicionales.
    if (fullUser.restaurantId) {
      await this.ensureMembership(
        fullUser.id,
        fullUser.restaurantId,
        fullUser.roleId ?? null,
        true,
      ).catch(() => undefined);
    }

    const payload: JwtPayload = {
      sub: fullUser.id,
      email: fullUser.email,
      roleId: fullUser.roleId ?? null,
      restaurantId: fullUser.restaurantId ?? null,
      roleName: fullUser.role?.name ?? null,
      restaurantSlug: fullUser.restaurant?.slug ?? null,
    };

    const token = this.jwtService.sign(payload);

    // JWT expira en 7 días
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        roleId: fullUser.roleId ?? null,
        restaurantId: fullUser.restaurantId ?? null,
        roleName: fullUser.role?.name ?? null,
        restaurantSlug: fullUser.restaurant?.slug ?? null,
      },
      token,
      expiresAt: expiresAt.toISOString(),
      needsSetup: this.needsRestaurantSetup(fullUser.restaurant),
    };
  }

  // Public helper: generate AuthResponse (token + user) for a user id
  async createAuthResponseForUserId(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        restaurant: {
          include: {
            hours: true,
          },
        },
        memberships: {
          include: {
            restaurant: {
              select: {
                id: true,
                status: true,
              },
            },
            role: true,
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    if (!user.restaurantId && user.memberships?.length > 0) {
      const nextMembership =
        user.memberships.find(
          (membership) => membership.restaurant?.status === 'ACTIVE',
        ) ?? user.memberships[0];

      if (nextMembership?.restaurantId) {
        const updatedUser = await this.prisma.user.update({
          where: { id: userId },
          data: {
            restaurantId: nextMembership.restaurantId,
            roleId: nextMembership.roleId ?? null,
          },
          include: {
            role: true,
            restaurant: {
              include: {
                hours: true,
              },
            },
          },
        });
        return await this.generateAuthResponse(updatedUser as User);
      }
    }

    return await this.generateAuthResponse(user as any);
  }

  async impersonate(
    restaurantId: string,
    adminId: string,
  ): Promise<AuthResponse> {
    // Verify restaurant exists
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    // 1. Find a target user (prefer Owner/Admin)
    const rolesPriority = [
      'OWNER',
      'Owner',
      'ADMIN',
      'Admin',
      'MANAGER',
      'Manager',
    ];

    let targetUser: any = null;

    // Try finding by role name priority (active users)
    for (const roleName of rolesPriority) {
      targetUser = await this.prisma.user.findFirst({
        where: {
          restaurantId,
          role: { name: roleName },
          isActive: true,
        },
        include: { role: true, restaurant: true },
      });
      if (targetUser) break;
    }

    // Fallback: any active user, oldest first
    if (!targetUser) {
      targetUser = await this.prisma.user.findFirst({
        where: { restaurantId, isActive: true },
        include: { role: true, restaurant: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    // If no active users, try to find and activate an inactive user
    if (!targetUser) {
      targetUser = await this.prisma.user.findFirst({
        where: { restaurantId, isActive: false },
        include: { role: true, restaurant: true },
        orderBy: { createdAt: 'asc' },
      });

      if (targetUser) {
        // Activate the user
        targetUser = await this.prisma.user.update({
          where: { id: targetUser.id },
          data: { isActive: true },
          include: { role: true, restaurant: true },
        });
      }
    }

    // If still no user found, create a temporary admin user
    if (!targetUser) {
      // Find or create OWNER role
      let ownerRole = await this.prisma.role.findFirst({
        where: {
          restaurantId,
          name: { in: ['OWNER', 'Owner'] },
        },
      });

      if (!ownerRole) {
        ownerRole = await this.prisma.role.create({
          data: {
            restaurantId,
            name: 'OWNER',
            permissions: ['all'],
            color: '#ef4444',
            isSystemRole: true,
          },
        });
      }

      // Create temporary admin user
      targetUser = await this.prisma.user.create({
        data: {
          email: `admin@${restaurant.slug}.temp`,
          password: '', // No password needed for impersonation
          name: `Admin ${restaurant.name}`,
          restaurantId,
          roleId: ownerRole.id,
          isActive: true,
        },
        include: { role: true, restaurant: true },
      });
    }

    // 2. Generate Token
    const authResponse = await this.generateAuthResponse(targetUser);

    // 3. Log Audit
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'IMPERSONATE',
        targetRestaurantId: restaurantId,
        details: {
          impersonatedUserEmail: targetUser.email,
          impersonatedUserId: targetUser.id,
          roleName: targetUser.role?.name,
        },
      },
    });

    return authResponse;
  }

  /**
   * Asegura (idempotente) que exista un membership del usuario para el
   * restaurante dado. Sirve como backfill perezoso para usuarios creados por
   * flujos que todavía no registran memberships explícitamente.
   */
  async ensureMembership(
    userId: string,
    restaurantId: string,
    roleId: string | null,
    isDefault = false,
  ): Promise<void> {
    await this.prisma.restaurantMembership.upsert({
      where: { userId_restaurantId: { userId, restaurantId } },
      update: roleId ? { roleId } : {},
      create: {
        userId,
        restaurantId,
        roleId: roleId ?? undefined,
        isDefault,
      },
    });
  }

  /**
   * Lista los restaurantes a los que el usuario puede acceder/cambiar.
   * Marca el restaurante activo actual.
   */
  async listAccessibleRestaurants(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, restaurantId: true, roleId: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.restaurantId) {
      await this.ensureMembership(
        userId,
        user.restaurantId,
        user.roleId ?? null,
        true,
      ).catch(() => undefined);
    }

    const memberships = await this.prisma.restaurantMembership.findMany({
      where: {
        userId,
        restaurant: { status: 'ACTIVE' },
      },
      include: {
        restaurant: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            logo: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    const activeRestaurantId = memberships.some(
      (m) => m.restaurantId === user.restaurantId,
    )
      ? user.restaurantId
      : (memberships[0]?.restaurantId ?? null);

    return {
      activeRestaurantId,
      restaurants: memberships.map((m) => ({
        restaurantId: m.restaurantId,
        slug: m.restaurant.slug,
        name: m.restaurant.name,
        status: m.restaurant.status,
        logo: m.restaurant.logo ?? null,
        roleId: m.roleId ?? null,
        roleName: m.role?.name ?? null,
        isActive: m.restaurantId === activeRestaurantId,
        isDefault: m.isDefault,
      })),
    };
  }

  /**
   * Cambia el restaurante activo del usuario a otro al que tenga acceso.
   * Actualiza User.restaurantId/roleId y emite un nuevo token de sesión.
   */
  async switchRestaurant(
    userId: string,
    restaurantId: string,
  ): Promise<AuthResponse> {
    const membership = await this.prisma.restaurantMembership.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
    });

    if (!membership) {
      // Tolerar SUPER_ADMIN o el propio restaurante activo aunque el registro
      // de membership todavía no exista (se creará al regenerar la sesión).
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: { select: { name: true } } },
      });
      const isSuperAdmin = user?.role?.name === 'SUPER_ADMIN';
      const isCurrent = user?.restaurantId === restaurantId;
      if (!isSuperAdmin && !isCurrent) {
        throw new ForbiddenException('No tenés acceso a este restaurante');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        restaurantId,
        ...(membership?.roleId ? { roleId: membership.roleId } : {}),
      },
      include: {
        role: true,
        restaurant: { include: { hours: true } },
      },
    });

    return await this.generateAuthResponse(updatedUser as User);
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private needsRestaurantSetup(restaurant: any): boolean {
    if (!restaurant) return true;

    // Check basic required fields for operation
    const hasBasicInfo = !!(
      restaurant.name &&
      restaurant.name.trim() !== '' &&
      restaurant.address &&
      restaurant.address.trim() !== '' &&
      restaurant.phone &&
      restaurant.phone.trim() !== ''
    );

    // Check if hours are configured
    const hasHours = restaurant.hours && restaurant.hours.length > 0;

    // Restaurant needs setup if basic info or hours are missing
    return !hasBasicInfo || !hasHours;
  }
}
