import { Injectable, Logger } from '@nestjs/common';
import {
  AFIP_IVA_CONDITION,
  AFIP_PADRON_SERVICE,
  AFIP_PADRON_URL,
} from '../utils/afip.constants';
import { isValidCuit, normalizeCuit } from '../utils/afip-cuit.util';
import { AfipWsaaService } from './afip-wsaa.service';
import { FiscalConfigService } from './fiscal-config.service';

export interface PadronLookupResult {
  ok: boolean;
  cuit: string;
  razonSocial?: string;
  condicionIva?: keyof typeof AFIP_IVA_CONDITION;
  condicionIvaId?: number;
  message?: string;
}

@Injectable()
export class AfipPadronService {
  private readonly logger = new Logger(AfipPadronService.name);

  constructor(
    private readonly fiscalConfig: FiscalConfigService,
    private readonly wsaa: AfipWsaaService,
  ) {}

  async lookupCuit(
    restaurantId: string,
    cuitInput: string,
  ): Promise<PadronLookupResult> {
    const cuit = normalizeCuit(cuitInput);
    if (!isValidCuit(cuit)) {
      return {
        ok: false,
        cuit,
        message: 'CUIT inválido',
      };
    }

    const config = await this.fiscalConfig.getPublicConfig(restaurantId);
    if (!config) {
      return {
        ok: false,
        cuit,
        message: 'Fiscal no configurado',
      };
    }

    const credentials =
      await this.fiscalConfig.getDecryptedCredentials(restaurantId);
    if (!credentials) {
      return {
        ok: false,
        cuit,
        message: 'Certificado ARCA no cargado',
      };
    }

    try {
      const auth = await this.wsaa.getCredentials(
        config.cuit,
        credentials.certificatePem,
        credentials.privateKeyPem,
        config.environment,
        AFIP_PADRON_SERVICE,
      );

      const url = `${AFIP_PADRON_URL[config.environment]}/${cuit}`;
      const response = await fetch(url, {
        headers: {
          Authorization: auth.token,
          sign: auth.sign,
          Accept: 'application/json',
        },
      });

      const body = await response.text();
      if (!response.ok) {
        this.logger.warn(
          `Padrón HTTP ${response.status} · cuit=${cuit}: ${body.slice(0, 200)}`,
        );
        return {
          ok: false,
          cuit,
          message: 'No se encontró el CUIT en ARCA',
        };
      }

      const data = JSON.parse(body) as Record<string, unknown>;
      const persona = (data.data ?? data.persona ?? data) as Record<
        string,
        unknown
      >;

      const razonSocial =
        (persona.nombre as string | undefined) ??
        (persona.razonSocial as string | undefined) ??
        ([persona.apellido, persona.nombre].filter(Boolean).join(', ') ||
          undefined);

      const impuestos = Array.isArray(persona.impuestos)
        ? (persona.impuestos as Array<string | number>).map(String)
        : [];

      let condicionIva: keyof typeof AFIP_IVA_CONDITION = 'CONSUMIDOR_FINAL';
      if (impuestos.some((code) => code === '32' || code === 'MONOTRIBUTO')) {
        condicionIva = 'MONOTRIBUTO';
      } else if (impuestos.some((code) => code === '30' || code === 'IVA')) {
        condicionIva = 'RESPONSABLE_INSCRIPTO';
      } else if (impuestos.some((code) => code === '34' || code === 'EXENTO')) {
        condicionIva = 'EXENTO';
      }

      return {
        ok: true,
        cuit,
        razonSocial: razonSocial?.trim() || undefined,
        condicionIva,
        condicionIvaId: AFIP_IVA_CONDITION[condicionIva],
      };
    } catch (error) {
      this.logger.warn(
        `Padrón lookup failed · cuit=${cuit}: ${error instanceof Error ? error.message : error}`,
      );
      return {
        ok: false,
        cuit,
        message:
          error instanceof Error
            ? error.message
            : 'Error consultando padrón ARCA',
      };
    }
  }
}
