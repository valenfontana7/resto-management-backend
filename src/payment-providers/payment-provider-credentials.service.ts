import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../mercadopago/encryption.service';
import { PaymentProviderName } from './interfaces';

export interface UpsertCredentialDto {
  provider: PaymentProviderName;
  publicKey?: string;
  secretKey: string;
  merchantId?: string;
  siteId?: string;
  isSandbox?: boolean;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpsertCredentialResult {
  credential: {
    id: string;
    provider: string;
    publicKey: string | null;
    merchantId: string | null;
    siteId: string | null;
    isSandbox: boolean;
    isActive: boolean;
    webhookSecretLast4: string | null;
    lastTestedAt: Date | null;
    lastTestStatus: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  /**
   * Plaintext del webhook secret, sólo presente la primera vez que se genera
   * (creación de credencial o rotación). Nunca volvemos a devolverlo.
   */
  webhookSecretReveal?: string;
}

/** Genera un secret hex de 64 caracteres (32 bytes). */
function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/** Providers que requieren un webhookSecret por tenant. */
const PROVIDERS_WITH_WEBHOOK_SECRET: PaymentProviderName[] = ['payway'];

@Injectable()
export class PaymentProviderCredentialsService {
  private readonly logger = new Logger(PaymentProviderCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async upsertCredential(
    restaurantId: string,
    dto: UpsertCredentialDto,
  ): Promise<UpsertCredentialResult> {
    const secretKeyCipher = this.encryption.encrypt(dto.secretKey);
    const secretKeyLast4 = dto.secretKey.slice(-4);

    // Si el provider necesita webhookSecret y no tiene uno, lo generamos.
    let webhookSecretReveal: string | undefined;
    let webhookSecretCipherForCreate: string | undefined;
    let webhookSecretLast4ForCreate: string | undefined;

    if (PROVIDERS_WITH_WEBHOOK_SECRET.includes(dto.provider)) {
      const existing = await this.prisma.paymentProviderCredential.findUnique({
        where: {
          restaurantId_provider: { restaurantId, provider: dto.provider },
        },
        select: { webhookSecretCipher: true },
      });
      if (!existing?.webhookSecretCipher) {
        webhookSecretReveal = generateWebhookSecret();
        webhookSecretCipherForCreate =
          this.encryption.encrypt(webhookSecretReveal);
        webhookSecretLast4ForCreate = webhookSecretReveal.slice(-4);
      }
    }

    const record = await this.prisma.paymentProviderCredential.upsert({
      where: {
        restaurantId_provider: {
          restaurantId,
          provider: dto.provider,
        },
      },
      create: {
        restaurantId,
        provider: dto.provider,
        publicKey: dto.publicKey,
        secretKeyCipher,
        secretKeyLast4,
        merchantId: dto.merchantId,
        siteId: dto.siteId,
        isSandbox: dto.isSandbox ?? false,
        isActive: dto.isActive ?? true,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        webhookSecretCipher: webhookSecretCipherForCreate,
        webhookSecretLast4: webhookSecretLast4ForCreate,
      },
      update: {
        publicKey: dto.publicKey,
        secretKeyCipher,
        secretKeyLast4,
        merchantId: dto.merchantId,
        siteId: dto.siteId,
        isSandbox: dto.isSandbox,
        isActive: dto.isActive,
        metadata: dto.metadata as Prisma.InputJsonValue,
        // En update sólo se setean si recién los generamos (primera vez para
        // un provider que ya existía sin secret); si ya tenía, no tocamos nada.
        ...(webhookSecretCipherForCreate
          ? {
              webhookSecretCipher: webhookSecretCipherForCreate,
              webhookSecretLast4: webhookSecretLast4ForCreate,
            }
          : {}),
      },
      select: {
        id: true,
        provider: true,
        publicKey: true,
        merchantId: true,
        siteId: true,
        isSandbox: true,
        isActive: true,
        webhookSecretLast4: true,
        lastTestedAt: true,
        lastTestStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { credential: record, webhookSecretReveal };
  }

  /**
   * Regenera el webhookSecret del provider y devuelve el plaintext nuevo.
   * Invalida cualquier webhook firmado con el secret anterior.
   */
  async rotateWebhookSecret(
    restaurantId: string,
    provider: PaymentProviderName,
  ): Promise<{ webhookSecretReveal: string; webhookSecretLast4: string }> {
    if (!PROVIDERS_WITH_WEBHOOK_SECRET.includes(provider)) {
      throw new NotFoundException(
        `Provider "${provider}" no usa webhookSecret por tenant.`,
      );
    }

    const exists = await this.prisma.paymentProviderCredential.findUnique({
      where: { restaurantId_provider: { restaurantId, provider } },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(
        `No hay credenciales de "${provider}" para este restaurante.`,
      );
    }

    const plaintext = generateWebhookSecret();
    const cipher = this.encryption.encrypt(plaintext);
    const last4 = plaintext.slice(-4);

    await this.prisma.paymentProviderCredential.update({
      where: { restaurantId_provider: { restaurantId, provider } },
      data: { webhookSecretCipher: cipher, webhookSecretLast4: last4 },
    });

    this.logger.log(
      `Webhook secret rotated for restaurant=${restaurantId} provider=${provider}`,
    );

    return { webhookSecretReveal: plaintext, webhookSecretLast4: last4 };
  }

  /**
   * Persiste el resultado del último test de credenciales.
   */
  async recordTestResult(
    restaurantId: string,
    provider: PaymentProviderName,
    result: { ok: boolean; error?: string },
  ): Promise<void> {
    await this.prisma.paymentProviderCredential.update({
      where: { restaurantId_provider: { restaurantId, provider } },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: result.ok ? 'ok' : 'failed',
        lastTestError: result.ok ? null : (result.error ?? null),
      },
    });
  }

  async listCredentials(restaurantId: string) {
    return this.prisma.paymentProviderCredential.findMany({
      where: { restaurantId },
      select: {
        id: true,
        provider: true,
        publicKey: true,
        merchantId: true,
        siteId: true,
        isSandbox: true,
        isActive: true,
        webhookSecretLast4: true,
        lastTestedAt: true,
        lastTestStatus: true,
        lastTestError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteCredential(restaurantId: string, provider: PaymentProviderName) {
    return this.prisma.paymentProviderCredential.delete({
      where: {
        restaurantId_provider: {
          restaurantId,
          provider,
        },
      },
    });
  }

  async toggleActive(
    restaurantId: string,
    provider: PaymentProviderName,
    isActive: boolean,
  ) {
    return this.prisma.paymentProviderCredential.update({
      where: {
        restaurantId_provider: {
          restaurantId,
          provider,
        },
      },
      data: { isActive },
      select: {
        id: true,
        provider: true,
        isActive: true,
      },
    });
  }

  /**
   * Devuelve credenciales en claro (incluyendo secretKey desencriptado).
   * Uso interno: validación, polling de pagos, cron de conciliación.
   * NO exponer este método directamente vía HTTP.
   */
  async getDecryptedCredential(
    restaurantId: string,
    provider: PaymentProviderName,
  ): Promise<{
    secretKey: string;
    publicKey?: string;
    merchantId?: string;
    siteId?: string;
    isSandbox: boolean;
    metadata: Record<string, unknown>;
    webhookSecret?: string;
  } | null> {
    const record = await this.prisma.paymentProviderCredential.findUnique({
      where: { restaurantId_provider: { restaurantId, provider } },
    });
    if (!record) return null;

    const secretKey = this.encryption.decrypt(record.secretKeyCipher);
    const webhookSecret = record.webhookSecretCipher
      ? this.encryption.decrypt(record.webhookSecretCipher)
      : undefined;

    return {
      secretKey,
      publicKey: record.publicKey ?? undefined,
      merchantId: record.merchantId ?? undefined,
      siteId: record.siteId ?? undefined,
      isSandbox: record.isSandbox,
      metadata: (record.metadata as Record<string, unknown>) ?? {},
      webhookSecret,
    };
  }
}
