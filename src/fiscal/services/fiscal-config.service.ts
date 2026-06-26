import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../mercadopago/encryption.service';
import type {
  AfipEnvironment,
  IssuerIvaCondition,
} from '../utils/afip.constants';
import { getAvailableFiscalTypes } from '../utils/afip-fiscal-validation.util';

export interface RestaurantFiscalConfig {
  cuit: string;
  razonSocial?: string;
  puntoVenta: number;
  defaultDocumentType?: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C';
  issuerIvaCondition?: IssuerIvaCondition;
  availableDocumentTypes: Array<'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C'>;
  environment: AfipEnvironment;
  certificateConfigured: boolean;
  ivaRate: number;
}

interface StoredFiscalRules {
  cuit?: string;
  razonSocial?: string;
  puntoVenta?: number;
  defaultDocumentType?: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C';
  issuerIvaCondition?: IssuerIvaCondition;
  environment?: AfipEnvironment;
  certificateConfigured?: boolean;
  certificateCiphertext?: string;
  privateKeyCiphertext?: string;
  lastConnectionOkAt?: string;
  /** Alícuota IVA general para facturas A/B (default 21). */
  ivaRate?: number;
}

@Injectable()
export class FiscalConfigService {
  private readonly logger = new Logger(FiscalConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  async getPublicConfig(
    restaurantId: string,
  ): Promise<RestaurantFiscalConfig | null> {
    const rules = await this.getStoredRules(restaurantId);
    if (!rules?.cuit || !rules.puntoVenta) return null;

    return {
      cuit: rules.cuit.replace(/\D/g, ''),
      razonSocial: rules.razonSocial,
      puntoVenta: rules.puntoVenta,
      defaultDocumentType: rules.defaultDocumentType,
      issuerIvaCondition: rules.issuerIvaCondition ?? 'RESPONSABLE_INSCRIPTO',
      availableDocumentTypes: getAvailableFiscalTypes(
        rules.issuerIvaCondition ?? 'RESPONSABLE_INSCRIPTO',
      ).filter((t) => t !== 'INTERNAL_TICKET' && t !== 'NOTA_CREDITO'),
      environment: this.resolveEnvironment(rules.environment),
      certificateConfigured: Boolean(
        rules.certificateConfigured && rules.certificateCiphertext,
      ),
      ivaRate: this.resolveIvaRate(rules.ivaRate),
    };
  }

  private resolveIvaRate(value?: number): number {
    if (value == null || !Number.isFinite(value) || value <= 0) return 21;
    return Math.min(Math.max(value, 0), 100);
  }

  async isReadyForAfip(restaurantId: string): Promise<boolean> {
    const config = await this.getPublicConfig(restaurantId);
    if (!config?.certificateConfigured) return false;
    const creds = await this.getDecryptedCredentials(restaurantId);
    return Boolean(creds);
  }

  async getDecryptedCredentials(
    restaurantId: string,
  ): Promise<{ certificatePem: string; privateKeyPem: string } | null> {
    const rules = await this.getStoredRules(restaurantId);
    if (!rules?.certificateCiphertext || !rules?.privateKeyCiphertext) {
      return null;
    }

    try {
      return {
        certificatePem: this.encryptionService.decrypt(
          rules.certificateCiphertext,
        ),
        privateKeyPem: this.encryptionService.decrypt(
          rules.privateKeyCiphertext,
        ),
      };
    } catch (error) {
      this.logger.error(
        `No se pudo desencriptar certificado AFIP · restaurant=${restaurantId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  async saveCertificate(
    restaurantId: string,
    certificatePem: string,
    privateKeyPem: string,
  ) {
    const cert = certificatePem.trim();
    const key = privateKeyPem.trim();

    if (!cert.includes('BEGIN CERTIFICATE') || !key.includes('BEGIN')) {
      throw new BadRequestException(
        'El certificado y la clave privada deben estar en formato PEM',
      );
    }

    const current = await this.getStoredRules(restaurantId);
    const merged: StoredFiscalRules = {
      ...current,
      certificateCiphertext: this.encryptionService.encrypt(cert),
      privateKeyCiphertext: this.encryptionService.encrypt(key),
      certificateConfigured: true,
    };

    await this.persistRules(restaurantId, merged);

    return {
      certificateConfigured: true,
    };
  }

  async clearCertificate(restaurantId: string) {
    const current = await this.getStoredRules(restaurantId);
    const merged: StoredFiscalRules = {
      ...current,
      certificateCiphertext: undefined,
      privateKeyCiphertext: undefined,
      certificateConfigured: false,
      lastConnectionOkAt: undefined,
    };
    await this.persistRules(restaurantId, merged);
    return { certificateConfigured: false };
  }

  async recordConnectionSuccess(restaurantId: string) {
    const current = (await this.getStoredRules(restaurantId)) ?? {};
    const merged: StoredFiscalRules = {
      ...current,
      lastConnectionOkAt: new Date().toISOString(),
    };
    await this.persistRules(restaurantId, merged);
    return { lastConnectionOkAt: merged.lastConnectionOkAt };
  }

  private async getStoredRules(
    restaurantId: string,
  ): Promise<StoredFiscalRules | null> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const rules = restaurant.businessRules;
    if (!rules || typeof rules !== 'object') return null;

    const fiscal = (rules as Record<string, unknown>).fiscal;
    if (!fiscal || typeof fiscal !== 'object') return null;

    return fiscal as StoredFiscalRules;
  }

  private async persistRules(restaurantId: string, fiscal: StoredFiscalRules) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const currentRules =
      restaurant.businessRules && typeof restaurant.businessRules === 'object'
        ? (restaurant.businessRules as Record<string, unknown>)
        : {};

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        businessRules: {
          ...currentRules,
          fiscal,
        } as object,
      },
    });
  }

  private resolveEnvironment(override?: AfipEnvironment): AfipEnvironment {
    if (override) return override;
    const fromEnv = this.configService.get<string>('AFIP_ENVIRONMENT');
    return fromEnv === 'produccion' ? 'produccion' : 'homologacion';
  }
}
