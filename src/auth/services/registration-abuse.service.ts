import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAlertsService } from '../../admin-alerts/admin-alerts.service';
import {
  getEmailCanonicalIdentity,
  normalizeEmailForStorage,
} from '../../common/utils/email-identity.util';

export interface RegistrationGuardContext {
  ip: string;
  email: string;
  name?: string;
  source: string;
}

interface RegistrationAbuseLimits {
  maxPerIpHour: number;
  alertGlobal15Min: number;
  blockGlobal15Min: number;
  maxPerIdentityDay: number;
}

interface RegistrationPolicyState {
  registrationDisabled: boolean;
  maintenanceEnabled: boolean;
}

interface RegistrationAbuseSignal {
  reason: string;
  ip: string;
  email: string;
  name?: string;
  source: string;
  globalCount?: number;
  ipCount?: number;
  identityCount?: number;
  limit?: number;
}

@Injectable()
export class RegistrationAbuseService {
  private readonly logger = new Logger(RegistrationAbuseService.name);
  private readonly settingsCacheTtlMs = 5_000;
  private settingsCache: {
    expiresAt: number;
    value: RegistrationPolicyState;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Optional() private readonly adminAlerts?: AdminAlertsService,
  ) {}

  private getLimits(): RegistrationAbuseLimits {
    return {
      maxPerIpHour: this.readIntEnv('REGISTRATION_ABUSE_MAX_PER_IP_HOUR', 8),
      alertGlobal15Min: this.readIntEnv(
        'REGISTRATION_ABUSE_ALERT_GLOBAL_15MIN',
        8,
      ),
      blockGlobal15Min: this.readIntEnv(
        'REGISTRATION_ABUSE_BLOCK_GLOBAL_15MIN',
        15,
      ),
      maxPerIdentityDay: this.readIntEnv(
        'REGISTRATION_ABUSE_MAX_PER_IDENTITY_DAY',
        2,
      ),
    };
  }

  private readIntEnv(key: string, fallback: number): number {
    const raw = process.env[key]?.trim();
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  async assertRegistrationAllowed(
    ctx: RegistrationGuardContext,
  ): Promise<void> {
    await this.assertRegistrationPolicyAllows();

    const normalizedEmail = normalizeEmailForStorage(ctx.email);
    const identity = getEmailCanonicalIdentity(normalizedEmail);
    const limits = this.getLimits();

    await this.assertEmailIdentityAvailable(normalizedEmail, identity);

    const ipKey = this.buildIpKey(ctx.ip);
    const ipCount = (await this.cache.get<number>(ipKey)) ?? 0;
    if (ipCount >= limits.maxPerIpHour) {
      await this.notifyAbuse({
        reason: 'ip_rate_limit',
        ip: ctx.ip,
        email: normalizedEmail,
        name: ctx.name,
        source: ctx.source,
        ipCount: ipCount + 1,
        limit: limits.maxPerIpHour,
      });
      throw new HttpException(
        'Demasiados intentos de registro desde esta conexión. Probá más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const identityKey = this.buildIdentityDayKey(identity);
    const identityCount = (await this.cache.get<number>(identityKey)) ?? 0;
    if (identityCount >= limits.maxPerIdentityDay) {
      await this.notifyAbuse({
        reason: 'identity_rate_limit',
        ip: ctx.ip,
        email: normalizedEmail,
        name: ctx.name,
        source: ctx.source,
        identityCount: identityCount + 1,
        limit: limits.maxPerIdentityDay,
      });
      throw new ConflictException('Email already registered');
    }

    const global15Min = await this.countRecentRegistrations(15);
    if (global15Min >= limits.blockGlobal15Min) {
      await this.notifyAbuse({
        reason: 'global_block',
        ip: ctx.ip,
        email: normalizedEmail,
        name: ctx.name,
        source: ctx.source,
        globalCount: global15Min + 1,
        limit: limits.blockGlobal15Min,
      });
      throw new HttpException(
        'El registro está temporalmente limitado por seguridad. Intentá más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (global15Min >= limits.alertGlobal15Min) {
      await this.notifyAbuse({
        reason: 'global_spike',
        ip: ctx.ip,
        email: normalizedEmail,
        name: ctx.name,
        source: ctx.source,
        globalCount: global15Min + 1,
        limit: limits.alertGlobal15Min,
      });
    }

    await this.cache.set(ipKey, ipCount + 1, 60 * 60 * 1000);
    await this.cache.set(identityKey, identityCount + 1, 24 * 60 * 60 * 1000);
  }

  async shouldSuppressRoutineRegistrationAlerts(): Promise<boolean> {
    const limits = this.getLimits();
    const global15Min = await this.countRecentRegistrations(15);
    return global15Min >= limits.alertGlobal15Min;
  }

  private async assertRegistrationPolicyAllows(): Promise<void> {
    if (this.isRegistrationDisabledByEnv()) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        code: 'REGISTRATION_DISABLED',
        message:
          'El registro de nuevas cuentas está temporalmente deshabilitado.',
      });
    }

    const policy = await this.getRegistrationPolicyState();
    if (policy.registrationDisabled || policy.maintenanceEnabled) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        code: 'REGISTRATION_DISABLED',
        message:
          'El registro de nuevas cuentas está temporalmente deshabilitado.',
      });
    }
  }

  private isRegistrationDisabledByEnv(): boolean {
    const raw = process.env.REGISTRATION_DISABLED?.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private async getRegistrationPolicyState(): Promise<RegistrationPolicyState> {
    const now = Date.now();
    if (this.settingsCache && this.settingsCache.expiresAt > now) {
      return this.settingsCache.value;
    }

    const settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        registrationDisabled: true,
        maintenanceEnabled: true,
      },
    });

    const resolved: RegistrationPolicyState = {
      registrationDisabled: settings?.registrationDisabled ?? false,
      maintenanceEnabled: settings?.maintenanceEnabled ?? false,
    };

    this.settingsCache = {
      value: resolved,
      expiresAt: now + this.settingsCacheTtlMs,
    };

    return resolved;
  }

  private async assertEmailIdentityAvailable(
    normalizedEmail: string,
    identity: string,
  ): Promise<void> {
    const hasConflict = await this.hasEmailIdentityConflict(
      normalizedEmail,
      identity,
    );
    if (hasConflict) {
      throw new ConflictException('Email already registered');
    }
  }

  private async hasEmailIdentityConflict(
    normalizedEmail: string,
    identity: string,
  ): Promise<boolean> {
    const exact = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (exact) {
      return true;
    }

    const canonicalStored = await this.prisma.user.findFirst({
      where: {
        email: { equals: identity, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (canonicalStored) {
      return true;
    }

    const at = identity.lastIndexOf('@');
    if (at <= 0) {
      return false;
    }

    const baseLocal = identity.slice(0, at);
    const domain = identity.slice(at + 1);
    const aliasPrefix = `${baseLocal}+`;

    const aliasCandidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        email: {
          startsWith: aliasPrefix,
          mode: 'insensitive',
        },
      },
      select: { email: true },
      take: 25,
    });

    if (
      aliasCandidates.some(
        (user) => getEmailCanonicalIdentity(user.email) === identity,
      )
    ) {
      return true;
    }

    if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
      return false;
    }

    const gmailDomain =
      domain === 'googlemail.com' ? 'googlemail.com' : 'gmail.com';
    const domainCandidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        email: { endsWith: `@${gmailDomain}`, mode: 'insensitive' },
      },
      select: { email: true },
      take: 100,
    });

    return domainCandidates.some(
      (user) =>
        getEmailCanonicalIdentity(user.email) === identity &&
        user.email.toLowerCase() !== normalizedEmail,
    );
  }

  private async countRecentRegistrations(
    windowMinutes: number,
  ): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.prisma.user.count({
      where: {
        createdAt: { gte: since },
        deletedAt: null,
      },
    });
  }

  private buildIpKey(ip: string): string {
    const normalizedIp = ip.trim() || 'unknown';
    return `reg-abuse:ip:${normalizedIp}`;
  }

  private buildIdentityDayKey(identity: string): string {
    return `reg-abuse:identity:${identity}`;
  }

  private async notifyAbuse(payload: RegistrationAbuseSignal): Promise<void> {
    const debounceKey = `reg-abuse:alert:${payload.reason}`;
    const alreadySent = await this.cache.get<boolean>(debounceKey);
    if (alreadySent) return;

    await this.cache.set(debounceKey, true, 15 * 60 * 1000);

    this.logger.warn(
      `Registration abuse signal (${payload.reason}): ${JSON.stringify(payload)}`,
    );

    void this.adminAlerts?.notifyRegistrationAbuse({
      source: payload.source,
      reason: payload.reason,
      ip: payload.ip,
      email: payload.email,
      name: payload.name,
      globalCount: payload.globalCount,
      ipCount: payload.ipCount,
      identityCount: payload.identityCount,
      limit: payload.limit,
    });
  }
}
