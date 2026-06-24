import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { normalizeEmailForStorage } from '../../common/utils/email-identity.util';

export type AuthEmailAbuseScope =
  | 'magic_link'
  | 'password_reset'
  | 'email_verification'
  | 'login_intent'
  | 'customer_session';

export interface AuthEmailAbuseContext {
  ip: string;
  email: string;
  scope: AuthEmailAbuseScope;
}

@Injectable()
export class AuthEmailAbuseService {
  private readonly logger = new Logger(AuthEmailAbuseService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async assertEmailDeliveryAllowed(ctx: AuthEmailAbuseContext): Promise<void> {
    const normalizedEmail = normalizeEmailForStorage(ctx.email);
    const normalizedIp = ctx.ip.trim() || 'unknown';
    const limits = this.getLimits(ctx.scope);

    const ipKey = `auth-email:ip:${ctx.scope}:${normalizedIp}`;
    const ipCount = (await this.cache.get<number>(ipKey)) ?? 0;
    if (ipCount >= limits.maxPerIpHour) {
      this.logger.warn(
        `Auth email blocked (${ctx.scope}) ip=${normalizedIp} count=${ipCount + 1}`,
      );
      throw new HttpException(
        'Demasiados intentos desde esta conexión. Probá más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const emailKey = `auth-email:recipient:${ctx.scope}:${normalizedEmail}`;
    const emailCount = (await this.cache.get<number>(emailKey)) ?? 0;
    if (emailCount >= limits.maxPerRecipientHour) {
      this.logger.warn(
        `Auth email blocked (${ctx.scope}) email=${normalizedEmail} count=${emailCount + 1}`,
      );
      throw new HttpException(
        'Demasiados intentos para este email. Probá más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cache.set(ipKey, ipCount + 1, 60 * 60 * 1000);
    await this.cache.set(emailKey, emailCount + 1, 60 * 60 * 1000);
  }

  private getLimits(scope: AuthEmailAbuseScope): {
    maxPerIpHour: number;
    maxPerRecipientHour: number;
  } {
    switch (scope) {
      case 'magic_link':
        return {
          maxPerIpHour: this.readIntEnv('AUTH_MAGIC_LINK_MAX_PER_IP_HOUR', 8),
          maxPerRecipientHour: this.readIntEnv(
            'AUTH_MAGIC_LINK_MAX_PER_EMAIL_HOUR',
            4,
          ),
        };
      case 'password_reset':
        return {
          maxPerIpHour: this.readIntEnv(
            'AUTH_PASSWORD_RESET_MAX_PER_IP_HOUR',
            8,
          ),
          maxPerRecipientHour: this.readIntEnv(
            'AUTH_PASSWORD_RESET_MAX_PER_EMAIL_HOUR',
            4,
          ),
        };
      case 'email_verification':
        return {
          maxPerIpHour: this.readIntEnv('AUTH_EMAIL_VERIFY_MAX_PER_IP_HOUR', 8),
          maxPerRecipientHour: this.readIntEnv(
            'AUTH_EMAIL_VERIFY_MAX_PER_EMAIL_HOUR',
            4,
          ),
        };
      case 'login_intent':
        return {
          maxPerIpHour: this.readIntEnv(
            'AUTH_LOGIN_INTENT_MAX_PER_IP_HOUR',
            30,
          ),
          maxPerRecipientHour: this.readIntEnv(
            'AUTH_LOGIN_INTENT_MAX_PER_EMAIL_HOUR',
            15,
          ),
        };
      case 'customer_session':
        return {
          maxPerIpHour: this.readIntEnv(
            'AUTH_CUSTOMER_SESSION_MAX_PER_IP_HOUR',
            10,
          ),
          maxPerRecipientHour: this.readIntEnv(
            'AUTH_CUSTOMER_SESSION_MAX_PER_EMAIL_HOUR',
            5,
          ),
        };
      default:
        return { maxPerIpHour: 8, maxPerRecipientHour: 4 };
    }
  }

  private readIntEnv(key: string, fallback: number): number {
    const raw = process.env[key]?.trim();
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
