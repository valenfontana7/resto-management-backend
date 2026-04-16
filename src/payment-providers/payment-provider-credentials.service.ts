import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class PaymentProviderCredentialsService {
  private readonly logger = new Logger(PaymentProviderCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async upsertCredential(restaurantId: string, dto: UpsertCredentialDto) {
    const secretKeyCipher = this.encryption.encrypt(dto.secretKey);

    return this.prisma.paymentProviderCredential.upsert({
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
        merchantId: dto.merchantId,
        siteId: dto.siteId,
        isSandbox: dto.isSandbox ?? false,
        isActive: dto.isActive ?? true,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        publicKey: dto.publicKey,
        secretKeyCipher,
        merchantId: dto.merchantId,
        siteId: dto.siteId,
        isSandbox: dto.isSandbox,
        isActive: dto.isActive,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        provider: true,
        publicKey: true,
        merchantId: true,
        siteId: true,
        isSandbox: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
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
}
