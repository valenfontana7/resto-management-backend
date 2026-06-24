import {
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { renderEmailVerificationEmail } from '../../email/email-templates';

const VERIFICATION_EXPIRY_HOURS = 24;

@Injectable()
export class OwnerEmailVerificationService {
  private readonly logger = new Logger(OwnerEmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  isRequirementEnabled(): boolean {
    const raw =
      process.env.OWNER_EMAIL_VERIFICATION_REQUIRED?.trim().toLowerCase();
    if (raw === '0' || raw === 'false' || raw === 'no') return false;
    return true;
  }

  isEmailVerified(user: {
    emailVerifiedAt?: Date | null;
    role?: { name?: string | null } | null;
  }): boolean {
    if (!this.isRequirementEnabled()) return true;
    if (this.isSuperAdminRole(user.role?.name)) return true;
    return Boolean(user.emailVerifiedAt);
  }

  async assertOwnerEmailVerified(userId: string): Promise<void> {
    if (!this.isRequirementEnabled()) return;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        emailVerifiedAt: true,
        role: { select: { name: true } },
      },
    });

    if (!user || this.isEmailVerified(user)) return;

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message:
        'Tenés que verificar tu email antes de crear o publicar tu restaurante.',
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null, deletedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async sendVerificationEmail(userId: string): Promise<{
    sent: true;
    expiresInHours: number;
    devLink?: string;
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });

    if (!user) {
      return { sent: true, expiresInHours: VERIFICATION_EXPIRY_HOURS };
    }

    if (user.emailVerifiedAt) {
      return { sent: true, expiresInHours: VERIFICATION_EXPIRY_HOURS };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.authEmailVerificationLink.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.authEmailVerificationLink.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const link = this.buildVerificationLink(rawToken);
    const html = renderEmailVerificationEmail({
      name: user.name,
      link,
      expiresInHours: VERIFICATION_EXPIRY_HOURS,
    });

    await this.emailService?.sendGenericEmail(
      user.email,
      'Confirmá tu email en Bentoo',
      html,
      'Bentoo',
    );

    const response = {
      sent: true as const,
      expiresInHours: VERIFICATION_EXPIRY_HOURS,
    };

    if (process.env.NODE_ENV !== 'production') {
      return { ...response, devLink: link };
    }

    return response;
  }

  async requestVerificationByEmail(email: string): Promise<{
    sent: true;
    expiresInHours: number;
    devLink?: string;
  }> {
    const normalized = email.trim().toLowerCase();
    const response = {
      sent: true as const,
      expiresInHours: VERIFICATION_EXPIRY_HOURS,
    };

    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, emailVerifiedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!user || user.emailVerifiedAt) {
      return response;
    }

    return this.sendVerificationEmail(user.id);
  }

  async consumeVerificationToken(token: string): Promise<{ verified: true }> {
    const normalized = token?.trim();
    if (!normalized || normalized.length < 24) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }

    const tokenHash = this.hashToken(normalized);
    const link = await this.prisma.authEmailVerificationLink.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, deletedAt: true, isActive: true } },
      },
    });

    const now = new Date();
    if (
      !link ||
      link.usedAt ||
      link.expiresAt.getTime() < now.getTime() ||
      !link.user.isActive ||
      link.user.deletedAt
    ) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authEmailVerificationLink.updateMany({
        where: {
          id: link.id,
          usedAt: null,
          expiresAt: { gte: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired verification link');
      }

      await tx.user.update({
        where: { id: link.userId },
        data: { emailVerifiedAt: now },
      });
    });

    return { verified: true };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildVerificationLink(rawToken: string): string {
    const base = (
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const url = new URL('/admin/verify-email', base);
    url.searchParams.set('token', rawToken);
    return url.toString();
  }

  private isSuperAdminRole(roleName?: string | null): boolean {
    return (roleName ?? '').trim().toUpperCase() === 'SUPER_ADMIN';
  }
}
