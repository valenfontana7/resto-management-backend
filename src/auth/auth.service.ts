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
  ChangePasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { Prisma, User } from '@prisma/client';
import { AdminAlertsService } from '../admin-alerts/admin-alerts.service';
import { EmailService } from '../email/email.service';
import {
  renderMagicLinkEmail,
  renderPasswordResetEmail,
} from '../email/email-templates';
import { RolesCatalogService } from '../common/services/roles-catalog.service';
import {
  normalizeRoleCode,
  normalizePermissionList,
} from '../common/utils/role.utils';
import { normalizeEmailForStorage } from '../common/utils/email-identity.util';
import { RegistrationAbuseService } from './services/registration-abuse.service';
import { AuthEmailAbuseService } from './services/auth-email-abuse.service';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { OwnerEmailVerificationService } from './services/owner-email-verification.service';
import { OwnershipService } from '../common/services/ownership.service';
import { hashDeviceToken, verifyDeviceToken } from './device-token.crypto';
import type { RequestUser } from './strategies/jwt.strategy';

export interface JwtPayload {
  sub: string; // userId or terminalId (device)
  email?: string;
  roleId?: string | null;
  restaurantId?: string | null;
  roleName?: string | null;
  restaurantSlug?: string | null;
  tokenType?: 'user' | 'device';
  terminalId?: string;
  issuedByUserId?: string;
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
  emailVerified?: boolean;
  emailVerificationRequired?: boolean;
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
const PASSWORD_RESET_EXPIRY_MINUTES = 60;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly rolesCatalog: RolesCatalogService,
    private readonly ownership: OwnershipService,
    @Optional() private readonly adminAlerts?: AdminAlertsService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly registrationAbuse?: RegistrationAbuseService,
    @Optional() private readonly authEmailAbuse?: AuthEmailAbuseService,
    @Optional() private readonly botDefense?: BotDefenseService,
    @Optional()
    private readonly ownerEmailVerification?: OwnerEmailVerificationService,
  ) {}

  private normalizeEmail(email: string): string {
    return normalizeEmailForStorage(email);
  }

  private rethrowIfDuplicateUserEmail(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Email already registered');
    }
    throw error;
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
      normalizedPath === '/admin/magic-link' ||
      normalizedPath === '/admin/forgot-password' ||
      normalizedPath === '/admin/reset-password'
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

  private buildPasswordResetLink(token: string): string {
    const url = new URL('/admin/reset-password', this.getFrontendUrl());
    url.searchParams.set('token', token);
    return url.toString();
  }

  async register(
    dto: RegisterDto,
    meta?: { ip?: string },
  ): Promise<AuthResponse> {
    if (this.botDefense?.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.register', {
        ip: meta?.ip,
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      return this.botDefense.buildDecoyAuthResponse({
        email: dto.email,
        name: dto.name,
      });
    }

    await this.botDefense?.assertTurnstileToken(dto.turnstileToken);
    this.botDefense?.assertRegistrationEmailPolicy(dto.email);

    await this.registrationAbuse?.assertRegistrationAllowed({
      ip: meta?.ip ?? 'unknown',
      email: dto.email,
      name: dto.name,
      source: 'auth.register',
    });

    const normalizedEmail = this.normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
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
      let user: { id: string; email: string; name: string };
      try {
        user = await this.prisma.user.create({
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
      } catch (error) {
        this.rethrowIfDuplicateUserEmail(error);
      }

      void this.maybeNotifyUserRegistered({
        source: 'auth.register',
        userId: user.id,
        name: user.name,
        email: user.email,
        restaurantId: null,
        restaurantName: null,
      });

      void this.ownerEmailVerification?.sendVerificationEmail(user.id);

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

      // 2. Roles de sistema (catálogo canónico)
      await this.rolesCatalog.ensureSystemRoles(restaurant.id, tx);
      const ownerRoleId = await this.rolesCatalog.getOwnerRoleId(
        restaurant.id,
        tx,
      );

      // 3. Crear usuario dueño
      let user: User;
      try {
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            password: hashedPassword,
            name: dto.name,
            restaurantId: restaurant.id,
            roleId: ownerRoleId,
          },
        });
      } catch (error) {
        this.rethrowIfDuplicateUserEmail(error);
      }

      return { user, restaurant };
    });

    void this.maybeNotifyUserRegistered({
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

    void this.ownerEmailVerification?.sendVerificationEmail(result.user.id);

    return await this.generateAuthResponse(result.user);
  }

  async getLoginIntent(
    dto: LoginIntentDto,
    meta?: { ip?: string },
  ): Promise<LoginIntentResponse> {
    if (this.botDefense?.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.login-intent', {
        ip: meta?.ip,
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      return { mode: 'password', email: this.normalizeEmail(dto.email) };
    }

    await this.authEmailAbuse?.assertEmailDeliveryAllowed({
      ip: meta?.ip ?? 'unknown',
      email: dto.email,
      scope: 'login_intent',
    });

    const normalizedEmail = this.normalizeEmail(dto.email);
    return { mode: 'password', email: normalizedEmail };
  }

  async registerWithMagicLink(
    dto: RegisterMagicLinkDto,
    meta?: { ip?: string },
  ): Promise<MagicLinkRequestResponse> {
    if (this.botDefense?.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.register-magic-link', {
        ip: meta?.ip,
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      return this.botDefense.buildDecoyMagicLinkResponse();
    }

    await this.botDefense?.assertTurnstileToken(dto.turnstileToken);
    this.botDefense?.assertRegistrationEmailPolicy(dto.email);

    await this.registrationAbuse?.assertRegistrationAllowed({
      ip: meta?.ip ?? 'unknown',
      email: dto.email,
      name: dto.name,
      source: 'auth.register-magic-link',
    });

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
      let created: User;
      try {
        created = await this.prisma.user.create({
          data: {
            email: normalizedEmail,
            password: hashedPassword,
            name,
            isActive: true,
            passwordSetupRequired: false,
          },
        });
      } catch (error) {
        this.rethrowIfDuplicateUserEmail(error);
      }

      void this.maybeNotifyUserRegistered({
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

    return this.requestMagicLink(
      {
        email: normalizedEmail,
        redirect: dto.redirect,
      },
      meta,
    );
  }

  async requestMagicLink(
    dto: RequestMagicLinkDto,
    meta?: { ip?: string },
  ): Promise<MagicLinkRequestResponse> {
    if (this.botDefense?.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.magic-link.request', {
        ip: meta?.ip,
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      return {
        sent: true,
        expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
      };
    }

    await this.authEmailAbuse?.assertEmailDeliveryAllowed({
      ip: meta?.ip ?? 'unknown',
      email: dto.email,
      scope: 'magic_link',
    });

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
    const html = renderMagicLinkEmail({
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
        data: { lastLogin: now, emailVerifiedAt: now },
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
        throw new UnauthorizedException('Invalid credentials');
      }

      if (users.some((user) => !user.isActive)) {
        throw new UnauthorizedException('Invalid credentials');
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
      throw new UnauthorizedException('Invalid credentials');
    }

    const primaryPendingUser = activePendingUsers[0];

    if (
      !primaryPendingUser.activationCodeHash ||
      !primaryPendingUser.activationCodeExpiresAt
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (primaryPendingUser.activationCodeExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (primaryPendingUser.activationCodeAttempts >= 5) {
      throw new UnauthorizedException('Invalid credentials');
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

      throw new UnauthorizedException('Invalid credentials');
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

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        isActive: true,
        passwordSetupRequired: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (user.passwordSetupRequired) {
      throw new BadRequestException(
        'Password setup is still pending. Complete your first login first.',
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(dto.newPassword, user.password);

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  }

  async requestPasswordReset(
    dto: RequestPasswordResetDto,
    meta?: { ip?: string },
  ): Promise<MagicLinkRequestResponse> {
    if (this.botDefense?.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.forgot-password', {
        ip: meta?.ip,
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      return {
        sent: true,
        expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
      };
    }

    await this.authEmailAbuse?.assertEmailDeliveryAllowed({
      ip: meta?.ip ?? 'unknown',
      email: dto.email,
      scope: 'password_reset',
    });

    const normalizedEmail = this.normalizeEmail(dto.email);
    const response: MagicLinkRequestResponse = {
      sent: true,
      expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
    };

    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        isActive: true,
        passwordSetupRequired: false,
        deletedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!user) {
      return response;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashLoginToken(rawToken);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.authPasswordResetLink.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.authPasswordResetLink.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const link = this.buildPasswordResetLink(rawToken);
    const html = renderPasswordResetEmail({
      name: user.name,
      link,
      expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
    });

    await this.emailService?.sendGenericEmail(
      user.email,
      'Restablecé tu contraseña de Bentoo',
      html,
      'Bentoo',
    );

    if (process.env.NODE_ENV !== 'production') {
      response.devLink = link;
    }

    return response;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const token = dto.token?.trim();
    if (!token || token.length < 24) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }

    const tokenHash = this.hashLoginToken(token);
    const link = await this.prisma.authPasswordResetLink.findUnique({
      where: { tokenHash },
      include: {
        user: true,
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
      throw new UnauthorizedException('Invalid or expired reset link');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authPasswordResetLink.updateMany({
        where: {
          id: link.id,
          usedAt: null,
          expiresAt: { gte: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired reset link');
      }

      await tx.user.update({
        where: { id: link.userId },
        data: { password: hashedPassword },
      });
    });

    return { message: 'Password reset successfully' };
  }

  /** Token de 90 días para BentooSalonLocal / caja — revocable desde admin. */
  async issueDeviceToken(
    userId: string,
    restaurantId: string,
    terminalId: string,
  ): Promise<{ token: string; expiresAt: string; terminalId: string }> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const terminal = await this.prisma.restaurantTerminal.findFirst({
      where: { id: terminalId, restaurantId, isActive: true },
    });
    if (!terminal) {
      throw new NotFoundException('Terminal no encontrada o inactiva');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const payload: JwtPayload = {
      sub: terminalId,
      tokenType: 'device',
      restaurantId,
      terminalId,
      issuedByUserId: userId,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '90d' });
    const deviceTokenHash = hashDeviceToken(token);

    await this.prisma.restaurantTerminal.update({
      where: { id: terminalId },
      data: {
        deviceTokenHash,
        deviceTokenExpiresAt: expiresAt,
      },
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      terminalId,
    };
  }

  async resolveDeviceAuth(token: string): Promise<RequestUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (
      payload.tokenType !== 'device' ||
      !payload.terminalId ||
      !payload.restaurantId ||
      !payload.issuedByUserId
    ) {
      throw new UnauthorizedException('Invalid device token');
    }

    const terminal = await this.prisma.restaurantTerminal.findFirst({
      where: {
        id: payload.terminalId,
        restaurantId: payload.restaurantId,
        isActive: true,
      },
    });

    if (!terminal?.deviceTokenHash) {
      throw new UnauthorizedException('Device token revoked');
    }

    if (!verifyDeviceToken(token, terminal.deviceTokenHash)) {
      throw new UnauthorizedException('Device token revoked');
    }

    if (
      terminal.deviceTokenExpiresAt &&
      terminal.deviceTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Device token expired');
    }

    await this.validateUser(payload.issuedByUserId);

    return {
      userId: payload.issuedByUserId,
      email: `device:${terminal.name}`,
      roleId: null,
      restaurantId: payload.restaurantId,
      role: 'DEVICE',
      terminalId: payload.terminalId,
      tokenType: 'device',
    };
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        restaurantId: true,
        isActive: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
            color: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
          },
        },
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
        emailVerifiedAt: true,
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
    return normalizeRoleCode(roleName);
  }

  private normalizePermissions(permissions: string[]) {
    return normalizePermissionList(permissions);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
      emailVerified:
        this.ownerEmailVerification?.isEmailVerified(fullUser) ?? true,
      emailVerificationRequired: !(
        this.ownerEmailVerification?.isEmailVerified(fullUser) ?? true
      ),
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
      const ownerRoleId = await this.rolesCatalog.getOwnerRoleId(restaurantId);
      const ownerRole = await this.prisma.role.findUnique({
        where: { id: ownerRoleId },
      });
      if (!ownerRole) {
        throw new NotFoundException('OWNER role not found for restaurant');
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

  private async maybeNotifyUserRegistered(
    payload: Parameters<AdminAlertsService['notifyUserRegistered']>[0],
  ): Promise<void> {
    if (!this.adminAlerts) return;

    const suppress =
      (await this.registrationAbuse?.shouldSuppressRoutineRegistrationAlerts()) ??
      false;
    if (suppress) return;

    void this.adminAlerts.notifyUserRegistered(payload);
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
