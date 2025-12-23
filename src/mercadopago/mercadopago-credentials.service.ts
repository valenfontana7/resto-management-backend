import { BadRequestException, Injectable } from '@nestjs/common';
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
  }> {
    const credential = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId },
      select: { accessTokenCiphertext: true, createdAt: true },
    });

    if (!credential) {
      return { connected: false, createdAt: null };
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
    };
  }

  async setToken(
    restaurantId: string,
    accessToken: string,
    isSandbox = false,
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
        isSandbox: !!isSandbox,
      },
      update: {
        accessTokenCiphertext: ciphertext,
        accessTokenLast4: last4,
        isSandbox: !!isSandbox,
      },
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
}
