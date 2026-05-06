import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';

@Injectable()
export class MercadoPagoCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getStatus(restaurantId: string): Promise<{
    connected: boolean;
    createdAt: string | null;
    updatedAt: string | null;
    isSandbox: boolean;
    accessTokenLast4: string | null;
    publishableKeyConfigured: boolean;
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
      };
    }

    let connected = false;
    try {
      this.encryptionService.decrypt(credential.accessTokenCiphertext);
      connected = true;
    } catch {
      connected = false;
    }

    return {
      connected,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
      isSandbox: !!credential.isSandbox,
      accessTokenLast4: credential.accessTokenLast4 ?? null,
      publishableKeyConfigured: !!credential.publishableKey,
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
