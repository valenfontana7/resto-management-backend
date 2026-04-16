import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../mercadopago/encryption.service';
import { IPaymentProvider, PaymentProviderName } from './interfaces';
import { MercadoPagoProvider } from './providers/mercadopago.provider';
import { PaywayProvider } from './providers/payway.provider';

/**
 * Resuelve la implementación correcta de IPaymentProvider
 * según el proveedor seleccionado.
 *
 * Para obtener credenciales per-tenant, busca en PaymentProviderCredential
 * y las inyecta en el metadata del provider.
 */
@Injectable()
export class PaymentProviderFactory {
  private readonly logger = new Logger(PaymentProviderFactory.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly mpProvider: MercadoPagoProvider,
    private readonly paywayProvider: PaywayProvider,
  ) {}

  /**
   * Obtiene el provider base sin credenciales per-tenant.
   * Útil cuando las credenciales se pasan manualmente.
   */
  getProvider(name: PaymentProviderName): IPaymentProvider {
    switch (name) {
      case 'mercadopago':
        return this.mpProvider;
      case 'payway':
        return this.paywayProvider;
      default:
        throw new Error(`Payment provider "${String(name)}" not supported`);
    }
  }

  /**
   * Obtiene el provider con credenciales del restaurant ya resueltas.
   * Retorna un wrapper que inyecta las credenciales en cada llamada.
   */
  async getProviderForRestaurant(
    restaurantId: string,
    providerName: PaymentProviderName,
  ): Promise<{
    provider: IPaymentProvider;
    credentials: Record<string, unknown>;
  }> {
    const credential = await this.prisma.paymentProviderCredential.findUnique({
      where: {
        restaurantId_provider: {
          restaurantId,
          provider: providerName,
        },
      },
    });

    if (!credential || !credential.isActive) {
      throw new Error(
        `No active ${providerName} credentials for restaurant ${restaurantId}`,
      );
    }

    // Desencriptar la secret key
    let secretKey: string | undefined;
    if (credential.secretKeyCipher) {
      secretKey = this.encryption.decrypt(credential.secretKeyCipher);
    }

    const metadata: Record<string, unknown> = {
      ...((credential.metadata as Record<string, unknown>) || {}),
      isSandbox: credential.isSandbox,
    };

    if (providerName === 'mercadopago') {
      metadata.accessToken = secretKey;
    } else if (providerName === 'payway') {
      metadata.apiKey = secretKey;
      metadata.publicApiKey = credential.publicKey;
      metadata.siteId = credential.siteId;
      metadata.merchantId = credential.merchantId;
    }

    return {
      provider: this.getProvider(providerName),
      credentials: metadata,
    };
  }

  /**
   * Retorna el proveedor por defecto del restaurant.
   * Busca la primera credencial activa, priorizando por orden de creación.
   */
  async getDefaultProviderForRestaurant(restaurantId: string): Promise<{
    provider: IPaymentProvider;
    credentials: Record<string, unknown>;
    providerName: PaymentProviderName;
  }> {
    const credentials = await this.prisma.paymentProviderCredential.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });

    if (credentials.length === 0) {
      // Fallback al MercadoPago global
      return {
        provider: this.mpProvider,
        credentials: {},
        providerName: 'mercadopago',
      };
    }

    const cred = credentials[0];
    const result = await this.getProviderForRestaurant(
      restaurantId,
      cred.provider as PaymentProviderName,
    );

    return {
      ...result,
      providerName: cred.provider as PaymentProviderName,
    };
  }

  /**
   * Lista los proveedores activos de un restaurant.
   */
  async listActiveProviders(restaurantId: string): Promise<
    Array<{
      provider: PaymentProviderName;
      isActive: boolean;
      isSandbox: boolean;
    }>
  > {
    const credentials = await this.prisma.paymentProviderCredential.findMany({
      where: { restaurantId },
      select: { provider: true, isActive: true, isSandbox: true },
    });

    return credentials.map((c) => ({
      provider: c.provider as PaymentProviderName,
      isActive: c.isActive,
      isSandbox: c.isSandbox,
    }));
  }
}
