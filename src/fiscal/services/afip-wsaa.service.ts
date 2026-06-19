import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AfipEnvironment } from '../utils/afip.constants';
import { AFIP_WSAA_URL, AFIP_WSFE_SERVICE } from '../utils/afip.constants';
import { signLoginTicketRequest } from '../utils/afip-cms.util';
import {
  buildLoginCmsEnvelope,
  buildLoginTicketRequestXml,
  parseLoginCmsResponse,
  type AfipAuthCredentials,
} from '../utils/afip-xml.util';

@Injectable()
export class AfipWsaaService {
  private readonly logger = new Logger(AfipWsaaService.name);
  private readonly cache = new Map<string, AfipAuthCredentials>();

  constructor(private readonly configService: ConfigService) {}

  async getCredentials(
    cuit: string,
    certificatePem: string,
    privateKeyPem: string,
    environment?: AfipEnvironment,
    service: string = AFIP_WSFE_SERVICE,
  ): Promise<AfipAuthCredentials> {
    const env = this.resolveEnvironment(environment);
    const cacheKey = `${cuit}:${env}:${service}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expirationTime.getTime() > Date.now() + 60_000) {
      return cached;
    }

    const credentials = await this.loginCms(
      cuit,
      certificatePem,
      privateKeyPem,
      env,
      service,
    );
    this.cache.set(cacheKey, credentials);
    return credentials;
  }

  clearCache(cuit?: string) {
    if (!cuit) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${cuit}:`)) this.cache.delete(key);
    }
  }

  private resolveEnvironment(override?: AfipEnvironment): AfipEnvironment {
    if (override) return override;
    const fromEnv = this.configService.get<string>('AFIP_ENVIRONMENT');
    return fromEnv === 'produccion' ? 'produccion' : 'homologacion';
  }

  private async loginCms(
    cuit: string,
    certificatePem: string,
    privateKeyPem: string,
    environment: AfipEnvironment,
    service: string,
  ): Promise<AfipAuthCredentials> {
    const now = new Date();
    const uniqueId = Math.floor(now.getTime() / 1000);
    const generationTime = new Date(now.getTime() - 5 * 60 * 1000);
    const expirationTime = new Date(now.getTime() + 5 * 60 * 1000);

    const tra = buildLoginTicketRequestXml(
      uniqueId,
      generationTime,
      expirationTime,
      service,
    );

    const cms = signLoginTicketRequest(tra, certificatePem, privateKeyPem);
    const envelope = buildLoginCmsEnvelope(cms);
    const url = AFIP_WSAA_URL[environment];

    this.logger.debug(`WSAA LoginCms · cuit=${cuit} env=${environment}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'https://wsaa.afip.gov.ar/ws/services/LoginCms/loginCms',
      },
      body: envelope,
    });

    const body = await response.text();
    if (!response.ok) {
      this.logger.error(`WSAA HTTP ${response.status}: ${body.slice(0, 400)}`);
      throw new Error(`WSAA respondió HTTP ${response.status}`);
    }

    return parseLoginCmsResponse(body);
  }
}
