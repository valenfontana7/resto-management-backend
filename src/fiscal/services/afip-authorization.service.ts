import { Injectable, Logger } from '@nestjs/common';
import { FiscalDocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AFIP_CBTE_TYPE } from '../utils/afip.constants';
import { mapFiscalDocumentType } from '../utils/afip-amount.util';
import { withFiscalAdvisoryLock } from '../utils/afip-lock.util';
import { AfipWsaaService } from './afip-wsaa.service';
import {
  AfipWsfeService,
  type AuthorizeInvoiceInput,
  type AuthorizeInvoiceResult,
} from './afip-wsfe.service';
import { FiscalConfigService } from './fiscal-config.service';

export interface EmitAfipInvoiceInput {
  restaurantId: string;
  type: FiscalDocumentType;
  totalPesos: number;
  customerDocType?: string | null;
  customerDocNumber?: string | null;
  customerIvaCondition?: number | null;
  relatedInvoiceType?: FiscalDocumentType | null;
  relatedVoucher?: AuthorizeInvoiceInput['relatedVoucher'];
  ivaRate?: number;
}

@Injectable()
export class AfipAuthorizationService {
  private readonly logger = new Logger(AfipAuthorizationService.name);

  constructor(
    private readonly fiscalConfig: FiscalConfigService,
    private readonly wsaa: AfipWsaaService,
    private readonly wsfe: AfipWsfeService,
    private readonly prisma: PrismaService,
  ) {}

  async testConnection(restaurantId: string) {
    const config = await this.fiscalConfig.getPublicConfig(restaurantId);
    if (!config) {
      return {
        ok: false,
        message: 'Completá CUIT y punto de venta en Ajustes',
      };
    }

    const credentials =
      await this.fiscalConfig.getDecryptedCredentials(restaurantId);
    if (!credentials) {
      return {
        ok: false,
        message: 'Cargá el certificado digital y la clave privada',
      };
    }

    try {
      const auth = await this.wsaa.getCredentials(
        config.cuit,
        credentials.certificatePem,
        credentials.privateKeyPem,
        config.environment,
      );

      const [lastB, lastA, lastC] = await Promise.all([
        this.wsfe.getLastVoucherNumber(
          auth,
          config.cuit,
          config.puntoVenta,
          AFIP_CBTE_TYPE.FACTURA_B,
          config.environment,
        ),
        config.availableDocumentTypes.includes('FACTURA_A')
          ? this.wsfe.getLastVoucherNumber(
              auth,
              config.cuit,
              config.puntoVenta,
              AFIP_CBTE_TYPE.FACTURA_A,
              config.environment,
            )
          : Promise.resolve(null),
        this.wsfe.getLastVoucherNumber(
          auth,
          config.cuit,
          config.puntoVenta,
          AFIP_CBTE_TYPE.FACTURA_C,
          config.environment,
        ),
      ]);

      return {
        ok: true,
        message: 'Conexión ARCA OK',
        environment: config.environment,
        lastFacturaB: lastB,
        lastFacturaA: lastA,
        lastFacturaC: lastC,
        tokenExpiresAt: auth.expirationTime.toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `Test AFIP falló · restaurant=${restaurantId}: ${error instanceof Error ? error.message : error}`,
      );
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo conectar con ARCA',
      };
    }
  }

  async authorize(
    input: EmitAfipInvoiceInput,
  ): Promise<AuthorizeInvoiceResult & { skipped?: boolean; reason?: string }> {
    const config = await this.fiscalConfig.getPublicConfig(input.restaurantId);
    if (!config) {
      return {
        success: false,
        skipped: true,
        reason: 'missing_config',
        puntoVenta: 0,
        errors: ['Fiscal no configurado (CUIT / punto de venta)'],
        observations: [],
      };
    }

    const credentials = await this.fiscalConfig.getDecryptedCredentials(
      input.restaurantId,
    );
    if (!credentials) {
      return {
        success: false,
        skipped: true,
        reason: 'missing_certificate',
        puntoVenta: config.puntoVenta,
        errors: ['Certificado ARCA no cargado'],
        observations: [],
      };
    }

    try {
      const auth = await this.wsaa.getCredentials(
        config.cuit,
        credentials.certificatePem,
        credentials.privateKeyPem,
        config.environment,
      );

      const relatedType = input.relatedInvoiceType ?? null;
      const cbteTipo = mapFiscalDocumentType(input.type, relatedType);
      const ivaRate = config.ivaRate ?? 21;

      return withFiscalAdvisoryLock(
        this.prisma,
        input.restaurantId,
        config.puntoVenta,
        cbteTipo,
        () =>
          this.wsfe.authorizeInvoice(auth, {
            cuit: config.cuit,
            puntoVenta: config.puntoVenta,
            type: input.type,
            totalPesos: input.totalPesos,
            customerDocType: input.customerDocType,
            customerDocNumber: input.customerDocNumber,
            customerIvaCondition: input.customerIvaCondition,
            relatedInvoiceType: input.relatedInvoiceType,
            relatedVoucher: input.relatedVoucher,
            environment: config.environment,
            ivaRate,
          }),
      );
    } catch (error) {
      this.logger.error(
        `AFIP authorize failed · restaurant=${input.restaurantId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        success: false,
        puntoVenta: config.puntoVenta,
        errors: [
          error instanceof Error ? error.message : 'Error de conexión ARCA',
        ],
        observations: [],
      };
    }
  }

  buildRelatedVoucher(
    invoiceType: FiscalDocumentType,
    puntoVenta: number,
    numero: number,
    cuit?: string,
  ) {
    return {
      cbteTipo: mapFiscalDocumentType(invoiceType),
      puntoVenta,
      numero,
      cuit,
    };
  }
}
