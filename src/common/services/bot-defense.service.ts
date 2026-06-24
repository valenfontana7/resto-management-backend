import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { normalizeEmailForStorage } from '../utils/email-identity.util';

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class BotDefenseService {
  private readonly logger = new Logger(BotDefenseService.name);

  isHoneypotTriggered(value?: string | null): boolean {
    return Boolean(value?.trim());
  }

  async applyBotDelayMs(minMs = 1200, maxMs = 2800): Promise<void> {
    const span = Math.max(0, maxMs - minMs);
    const delay = minMs + Math.floor(Math.random() * (span + 1));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  assertRegistrationEmailPolicy(email: string): void {
    if (!this.isPlusAliasRejectionEnabled()) return;

    const normalized = normalizeEmailForStorage(email);
    const at = normalized.indexOf('@');
    if (at <= 0) return;

    const local = normalized.slice(0, at);
    if (local.includes('+')) {
      throw new BadRequestException(
        'No se permiten alias de email con "+" en el registro.',
      );
    }
  }

  async assertTurnstileToken(token?: string | null): Promise<void> {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
    if (!secret) return;

    if (!token?.trim()) {
      throw new BadRequestException(
        'Verificación anti-bot requerida. Recargá la página e intentá de nuevo.',
      );
    }

    const body = new URLSearchParams({
      secret,
      response: token.trim(),
    });

    let payload: { success?: boolean; 'error-codes'?: string[] };
    try {
      const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      this.logger.warn(
        `Turnstile verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        'No pudimos verificar el captcha. Intentá más tarde.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!payload.success) {
      this.logger.warn(
        `Turnstile rejected token: ${(payload['error-codes'] ?? []).join(', ')}`,
      );
      throw new BadRequestException(
        'Verificación anti-bot inválida. Recargá la página e intentá de nuevo.',
      );
    }
  }

  /**
   * Respuesta señuelo para registro con contraseña: no persiste nada en DB.
   */
  buildDecoyAuthResponse(input: { email: string; name: string }): {
    user: {
      id: string;
      email: string;
      name: string;
      roleId: null;
      restaurantId: null;
    };
    token: string;
    expiresAt: string;
  } {
    return {
      user: {
        id: `decoy-${randomBytes(8).toString('hex')}`,
        email: normalizeEmailForStorage(input.email),
        name: input.name.trim(),
        roleId: null,
        restaurantId: null,
      },
      token: `decoy.${randomBytes(32).toString('hex')}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  buildDecoyMagicLinkResponse(): {
    sent: true;
    expiresInMinutes: number;
  } {
    return {
      sent: true,
      expiresInMinutes: 15,
    };
  }

  logHoneypotHit(context: string, meta?: Record<string, unknown>): void {
    this.logger.warn(
      `Honeypot triggered (${context}): ${JSON.stringify(meta ?? {})}`,
    );
  }

  private isPlusAliasRejectionEnabled(): boolean {
    const raw =
      process.env.REGISTRATION_REJECT_PLUS_ALIAS?.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }
}
