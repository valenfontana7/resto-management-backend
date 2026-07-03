import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { GoLiveEnforcementService } from '../restaurants/services/go-live-enforcement.service';

export interface TokenValidationResult {
  ok: boolean;
  reason?:
    | 'invalid_token'
    | 'sandbox_mismatch'
    | 'live_mismatch'
    | 'network_error'
    | 'unexpected_response';
  message?: string;
  livemode?: boolean;
  userId?: number;
}

@Injectable()
export class MercadoPagoCredentialsService {
  private readonly logger = new Logger(MercadoPagoCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly goLiveEnforcement: GoLiveEnforcementService,
  ) {}

  /**
   * Verifica que el access token sea válido contra la API de MercadoPago
   * antes de persistirlo. Además detecta si el flag isSandbox coincide con el
   * tipo de token (TEST-* vs APP_USR-*), para evitar combinaciones que rompen
   * el cobro real silenciosamente.
   */
  async validateAccessToken(
    accessToken: string,
    isSandbox: boolean,
  ): Promise<TokenValidationResult> {
    const token = (accessToken ?? '').trim();
    if (!token) {
      return {
        ok: false,
        reason: 'invalid_token',
        message: 'Access token vacío',
      };
    }

    const looksLikeTest = token.startsWith('TEST-');
    if (isSandbox && !looksLikeTest) {
      return {
        ok: false,
        reason: 'sandbox_mismatch',
        message:
          'Marcaste el token como sandbox pero parece de producción. Usá un token TEST-* o destildá sandbox.',
      };
    }
    if (!isSandbox && looksLikeTest) {
      return {
        ok: false,
        reason: 'live_mismatch',
        message:
          'El token es de prueba (TEST-*). Para cobrar de verdad usá tu token de producción APP_USR-*.',
      };
    }

    try {
      const res = await fetch('https://api.mercadopago.com/users/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          reason: 'invalid_token',
          message:
            'MercadoPago rechazó el token. Verificá que lo copiaste completo desde tu panel.',
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          reason: 'unexpected_response',
          message: `MercadoPago respondió ${res.status} al verificar el token.`,
        };
      }

      const json = (await res.json().catch(() => null)) as {
        id?: number;
        site_id?: string;
      } | null;
      if (!json?.id) {
        return {
          ok: false,
          reason: 'unexpected_response',
          message:
            'No pudimos confirmar el token con MercadoPago. Intentá nuevamente.',
        };
      }

      return {
        ok: true,
        userId: json.id,
        livemode: !looksLikeTest,
      };
    } catch (err) {
      this.logger.warn(
        `MP token validation network error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        ok: false,
        reason: 'network_error',
        message:
          'No pudimos contactar a MercadoPago para verificar el token. Probalo de nuevo en unos segundos.',
      };
    }
  }

  async getStatus(restaurantId: string): Promise<{
    connected: boolean;
    createdAt: string | null;
    updatedAt: string | null;
    isSandbox: boolean;
    accessTokenLast4: string | null;
    publishableKeyConfigured: boolean;
    connectedVia: 'manual' | 'oauth' | null;
    expiresAt: string | null;
    mpUserId: string | null;
    livemode: boolean | null;
  }> {
    const credential = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId },
      select: {
        accessTokenCiphertext: true,
        accessTokenLast4: true,
        publishableKey: true,
        isSandbox: true,
        createdAt: true,
        updatedAt: true,
        connectedVia: true,
        expiresAt: true,
        mpUserId: true,
        livemode: true,
      },
    });

    if (!credential) {
      return {
        connected: false,
        createdAt: null,
        updatedAt: null,
        isSandbox: false,
        accessTokenLast4: null,
        publishableKeyConfigured: false,
        connectedVia: null,
        expiresAt: null,
        mpUserId: null,
        livemode: null,
      };
    }

    let connected = false;
    try {
      this.encryptionService.decrypt(credential.accessTokenCiphertext);
      connected = true;
    } catch {
      connected = false;
    }

    const via = credential.connectedVia === 'oauth' ? 'oauth' : 'manual';

    return {
      connected,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
      isSandbox: !!credential.isSandbox,
      accessTokenLast4: credential.accessTokenLast4 ?? null,
      publishableKeyConfigured: !!credential.publishableKey,
      connectedVia: via,
      expiresAt: credential.expiresAt?.toISOString() ?? null,
      mpUserId: credential.mpUserId ?? null,
      livemode: credential.livemode ?? null,
    };
  }

  async setToken(
    restaurantId: string,
    accessToken: string,
    isSandbox = false,
    publishableKey?: string,
  ): Promise<void> {
    const normalizedRestaurantId = (restaurantId ?? '').trim();
    const normalizedToken = (accessToken ?? '').trim();

    if (!normalizedRestaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    if (!normalizedToken) {
      throw new BadRequestException({ error: 'accessToken es requerido' });
    }

    const ciphertext = this.encryptionService.encrypt(normalizedToken);
    const last4 =
      normalizedToken.length >= 4 ? normalizedToken.slice(-4) : null;

    await this.prisma.mercadoPagoCredential.upsert({
      where: { restaurantId: normalizedRestaurantId },
      create: {
        restaurantId: normalizedRestaurantId,
        accessTokenCiphertext: ciphertext,
        accessTokenLast4: last4,
        publishableKey: publishableKey ?? null,
        isSandbox: !!isSandbox,
      },
      update: {
        accessTokenCiphertext: ciphertext,
        accessTokenLast4: last4,
        publishableKey: publishableKey ?? undefined,
        isSandbox: !!isSandbox,
      },
    });
  }

  async setTokenAndEnableDigitalWallet(
    restaurantId: string,
    accessToken: string,
    isSandbox = false,
    publishableKey?: string,
  ): Promise<void> {
    const normalizedRestaurantId = (restaurantId ?? '').trim();
    const normalizedToken = (accessToken ?? '').trim();

    if (!normalizedRestaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    if (!normalizedToken) {
      throw new BadRequestException({ error: 'accessToken es requerido' });
    }

    const ciphertext = this.encryptionService.encrypt(normalizedToken);
    const last4 =
      normalizedToken.length >= 4 ? normalizedToken.slice(-4) : null;

    await this.goLiveEnforcement.assertCanEnableDigitalWallet(
      normalizedRestaurantId,
    );

    await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: normalizedRestaurantId },
        select: { businessRules: true },
      });

      if (!restaurant) {
        throw new BadRequestException({ error: 'restaurantId no encontrado' });
      }

      const mergedBusinessRules = this.mergeDigitalWalletIntoBusinessRules(
        restaurant.businessRules,
        true,
      );

      await tx.mercadoPagoCredential.upsert({
        where: { restaurantId: normalizedRestaurantId },
        create: {
          restaurantId: normalizedRestaurantId,
          accessTokenCiphertext: ciphertext,
          accessTokenLast4: last4,
          publishableKey: publishableKey ?? null,
          isSandbox: !!isSandbox,
        },
        update: {
          accessTokenCiphertext: ciphertext,
          accessTokenLast4: last4,
          publishableKey: publishableKey ?? undefined,
          isSandbox: !!isSandbox,
        },
      });

      await tx.restaurant.update({
        where: { id: normalizedRestaurantId },
        data: { businessRules: mergedBusinessRules },
      });
    });
  }

  /**
   * Guarda credenciales obtenidas via OAuth (incluye refresh_token y expiración)
   * y activa automáticamente digital-wallet como método de pago del restaurante.
   */
  async setOAuthCredentialsAndEnableDigitalWallet(params: {
    restaurantId: string;
    accessToken: string;
    refreshToken?: string | null;
    publishableKey?: string | null;
    mpUserId?: string | number | null;
    scope?: string | null;
    expiresInSeconds?: number | null;
    livemode?: boolean | null;
  }): Promise<void> {
    const restaurantId = (params.restaurantId ?? '').trim();
    const accessToken = (params.accessToken ?? '').trim();

    if (!restaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }
    if (!accessToken) {
      throw new BadRequestException({ error: 'accessToken es requerido' });
    }

    const accessCipher = this.encryptionService.encrypt(accessToken);
    const accessLast4 = accessToken.slice(-4);

    const refreshToken = (params.refreshToken ?? '').trim();
    const refreshCipher = refreshToken
      ? this.encryptionService.encrypt(refreshToken)
      : null;
    const refreshLast4 = refreshToken ? refreshToken.slice(-4) : null;

    const expiresAt =
      typeof params.expiresInSeconds === 'number' && params.expiresInSeconds > 0
        ? new Date(Date.now() + params.expiresInSeconds * 1000)
        : null;

    const livemode =
      typeof params.livemode === 'boolean'
        ? params.livemode
        : !accessToken.startsWith('TEST-');
    const isSandbox = !livemode;

    const mpUserId =
      params.mpUserId === undefined || params.mpUserId === null
        ? null
        : String(params.mpUserId);

    const canEnableDigitalWallet =
      await this.goLiveEnforcement.canEnableDigitalWallet(restaurantId);

    await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { businessRules: true },
      });
      if (!restaurant) {
        throw new BadRequestException({ error: 'restaurantId no encontrado' });
      }

      const mergedBusinessRules = this.mergeDigitalWalletIntoBusinessRules(
        restaurant.businessRules,
        canEnableDigitalWallet,
      );

      await tx.mercadoPagoCredential.upsert({
        where: { restaurantId },
        create: {
          restaurantId,
          accessTokenCiphertext: accessCipher,
          accessTokenLast4: accessLast4,
          refreshTokenCiphertext: refreshCipher,
          refreshTokenLast4: refreshLast4,
          publishableKey: params.publishableKey ?? null,
          isSandbox,
          livemode,
          mpUserId,
          scope: params.scope ?? null,
          expiresAt,
          connectedVia: 'oauth',
        },
        update: {
          accessTokenCiphertext: accessCipher,
          accessTokenLast4: accessLast4,
          refreshTokenCiphertext: refreshCipher,
          refreshTokenLast4: refreshLast4,
          publishableKey: params.publishableKey ?? undefined,
          isSandbox,
          livemode,
          mpUserId: mpUserId ?? undefined,
          scope: params.scope ?? undefined,
          expiresAt,
          connectedVia: 'oauth',
        },
      });

      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { businessRules: mergedBusinessRules },
      });
    });
  }

  /**
   * Actualiza solo los tokens (access + refresh) tras un refresh OAuth.
   * No toca businessRules ni la activación.
   */
  async updateOAuthTokens(params: {
    restaurantId: string;
    accessToken: string;
    refreshToken?: string | null;
    expiresInSeconds?: number | null;
    scope?: string | null;
    livemode?: boolean | null;
  }): Promise<void> {
    const restaurantId = (params.restaurantId ?? '').trim();
    const accessToken = (params.accessToken ?? '').trim();
    if (!restaurantId || !accessToken) {
      throw new BadRequestException({
        error: 'restaurantId y accessToken son requeridos',
      });
    }

    const accessCipher = this.encryptionService.encrypt(accessToken);
    const accessLast4 = accessToken.slice(-4);

    const refreshToken = (params.refreshToken ?? '').trim();
    const refreshCipher = refreshToken
      ? this.encryptionService.encrypt(refreshToken)
      : undefined;
    const refreshLast4 = refreshToken ? refreshToken.slice(-4) : undefined;

    const expiresAt =
      typeof params.expiresInSeconds === 'number' && params.expiresInSeconds > 0
        ? new Date(Date.now() + params.expiresInSeconds * 1000)
        : undefined;

    await this.prisma.mercadoPagoCredential.update({
      where: { restaurantId },
      data: {
        accessTokenCiphertext: accessCipher,
        accessTokenLast4: accessLast4,
        refreshTokenCiphertext: refreshCipher,
        refreshTokenLast4: refreshLast4,
        scope: params.scope ?? undefined,
        livemode:
          typeof params.livemode === 'boolean' ? params.livemode : undefined,
        isSandbox:
          typeof params.livemode === 'boolean' ? !params.livemode : undefined,
        expiresAt,
      },
    });
  }

  async getDecryptedRefreshToken(restaurantId: string): Promise<string | null> {
    const id = (restaurantId ?? '').trim();
    if (!id) return null;
    const credential = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId: id },
      select: { refreshTokenCiphertext: true },
    });
    if (!credential?.refreshTokenCiphertext) return null;
    try {
      return this.encryptionService.decrypt(credential.refreshTokenCiphertext);
    } catch {
      return null;
    }
  }

  async clearToken(restaurantId: string): Promise<void> {
    const normalizedRestaurantId = (restaurantId ?? '').trim();
    if (!normalizedRestaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    await this.prisma.mercadoPagoCredential.deleteMany({
      where: { restaurantId: normalizedRestaurantId },
    });
  }

  async clearTokenAndDisableDigitalWallet(restaurantId: string): Promise<void> {
    const normalizedRestaurantId = (restaurantId ?? '').trim();
    if (!normalizedRestaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: normalizedRestaurantId },
        select: { businessRules: true },
      });

      if (!restaurant) {
        throw new BadRequestException({ error: 'restaurantId no encontrado' });
      }

      const mergedBusinessRules = this.mergeDigitalWalletIntoBusinessRules(
        restaurant.businessRules,
        false,
      );

      await tx.mercadoPagoCredential.deleteMany({
        where: { restaurantId: normalizedRestaurantId },
      });

      await tx.restaurant.update({
        where: { id: normalizedRestaurantId },
        data: { businessRules: mergedBusinessRules },
      });
    });
  }

  async getDecryptedToken(restaurantId: string): Promise<string | null> {
    const normalizedRestaurantId = (restaurantId ?? '').trim();
    if (!normalizedRestaurantId) {
      return null;
    }

    const credential = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId: normalizedRestaurantId },
      select: { accessTokenCiphertext: true },
    });

    if (!credential) {
      return null;
    }

    return this.encryptionService.decrypt(credential.accessTokenCiphertext);
  }

  private mergeDigitalWalletIntoBusinessRules(
    businessRules: unknown,
    enabled: boolean,
  ): Prisma.InputJsonObject {
    const currentRules = this.toInputJsonObject(businessRules);
    const currentPayment = this.toInputJsonObject(currentRules.payment);

    const currentMethods = Array.isArray(currentPayment.methods)
      ? currentPayment.methods.map((method) =>
          this.normalizePaymentMethodAlias(String(method)),
        )
      : [];

    const methodsSet = new Set(currentMethods.filter(Boolean));
    if (enabled) {
      methodsSet.add('digital-wallet');
    } else {
      methodsSet.delete('digital-wallet');
    }

    return {
      ...currentRules,
      payment: {
        ...currentPayment,
        methods: Array.from(methodsSet),
        requirePrepayment:
          typeof currentPayment.requirePrepayment === 'boolean'
            ? currentPayment.requirePrepayment
            : false,
        acceptTips:
          typeof currentPayment.acceptTips === 'boolean'
            ? currentPayment.acceptTips
            : true,
      },
    };
  }

  private toInputJsonObject(value: unknown): Prisma.InputJsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Prisma.InputJsonObject;
  }

  private normalizePaymentMethodAlias(method: string): string {
    const normalized = String(method ?? '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');

    if (normalized === 'mercadopago' || normalized === 'payway') {
      return 'digital-wallet';
    }

    if (normalized === 'debit') return 'debit-card';
    if (normalized === 'credit') return 'credit-card';
    if (normalized === 'transfer') return 'bank-transfer';

    return normalized;
  }
}
