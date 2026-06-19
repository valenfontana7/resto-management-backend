import { Injectable, Logger } from '@nestjs/common';
import { FiscalDocumentType } from '@prisma/client';
import type { AfipEnvironment } from '../utils/afip.constants';
import {
  AFIP_IVA_CONDITION,
  AFIP_IVA_ID_21,
  AFIP_WSFE_URL,
} from '../utils/afip.constants';
import {
  buildAfipAmounts,
  isIvaDiscriminated,
  mapCustomerDocNumber,
  mapCustomerDocType,
  mapFiscalDocumentType,
} from '../utils/afip-amount.util';
import {
  buildWsfeAuthBlock,
  buildWsfeEnvelope,
  parseSoapFault,
  parseXmlTag,
  type AfipAuthCredentials,
} from '../utils/afip-xml.util';

export interface RelatedVoucherInput {
  cbteTipo: number;
  puntoVenta: number;
  numero: number;
  cuit?: string;
}

export interface AuthorizeInvoiceInput {
  cuit: string;
  puntoVenta: number;
  type: FiscalDocumentType;
  totalPesos: number;
  customerDocType?: string | null;
  customerDocNumber?: string | null;
  customerIvaCondition?: number | null;
  relatedInvoiceType?: FiscalDocumentType | null;
  relatedVoucher?: RelatedVoucherInput | null;
  environment?: AfipEnvironment;
}

export interface AuthorizeInvoiceResult {
  success: boolean;
  numero?: number;
  cae?: string;
  caeExpiresAt?: Date;
  puntoVenta: number;
  errors: string[];
  observations: string[];
  raw?: unknown;
}

@Injectable()
export class AfipWsfeService {
  private readonly logger = new Logger(AfipWsfeService.name);

  async getLastVoucherNumber(
    auth: AfipAuthCredentials,
    cuit: string,
    puntoVenta: number,
    cbteTipo: number,
    environment: AfipEnvironment,
  ): Promise<number> {
    const body = `${buildWsfeAuthBlock(auth.token, auth.sign, Number(cuit))}
      <PtoVta>${puntoVenta}</PtoVta>
      <CbteTipo>${cbteTipo}</CbteTipo>`;

    const envelope = buildWsfeEnvelope('FECompUltimoAutorizado', body);
    const xml = await this.postSoap(
      environment,
      'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
      envelope,
    );

    const cbteNro = parseXmlTag(xml, 'CbteNro');
    if (cbteNro == null) {
      throw new Error(
        parseSoapFault(xml) ?? 'No se pudo obtener último comprobante',
      );
    }

    return Number(cbteNro);
  }

  async authorizeInvoice(
    auth: AfipAuthCredentials,
    input: AuthorizeInvoiceInput,
  ): Promise<AuthorizeInvoiceResult> {
    const environment = input.environment ?? 'homologacion';
    const relatedType = input.relatedInvoiceType ?? null;
    const cbteTipo = mapFiscalDocumentType(input.type, relatedType);
    const lastNumber = await this.getLastVoucherNumber(
      auth,
      input.cuit,
      input.puntoVenta,
      cbteTipo,
      environment,
    );
    const nextNumber = lastNumber + 1;
    const amounts = buildAfipAmounts(input.type, input.totalPesos, relatedType);
    const docTipo = mapCustomerDocType(input.customerDocType);
    const docNro = mapCustomerDocNumber(docTipo, input.customerDocNumber);

    const today = new Date();
    const cbteFch = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const effectiveType =
      input.type === FiscalDocumentType.NOTA_CREDITO
        ? (relatedType ?? FiscalDocumentType.FACTURA_B)
        : input.type;

    const ivaBlock =
      isIvaDiscriminated(effectiveType) && amounts.impIVA > 0
        ? `<Iva>
            <AlicIva>
              <Id>${AFIP_IVA_ID_21}</Id>
              <BaseImp>${amounts.ivaBase}</BaseImp>
              <Importe>${amounts.impIVA}</Importe>
            </AlicIva>
          </Iva>`
        : '';

    const condicionIvaId =
      input.customerIvaCondition ??
      (input.type === FiscalDocumentType.FACTURA_B ||
      input.type === FiscalDocumentType.FACTURA_C
        ? AFIP_IVA_CONDITION.CONSUMIDOR_FINAL
        : undefined);

    const condicionIvaBlock =
      condicionIvaId && condicionIvaId > 0
        ? `<CondicionIVAReceptorId>${condicionIvaId}</CondicionIVAReceptorId>`
        : '';

    const cbtesAsocBlock = input.relatedVoucher
      ? `<CbtesAsoc>
            <CbteAsoc>
              <Tipo>${input.relatedVoucher.cbteTipo}</Tipo>
              <PtoVta>${input.relatedVoucher.puntoVenta}</PtoVta>
              <Nro>${input.relatedVoucher.numero}</Nro>
              ${input.relatedVoucher.cuit ? `<Cuit>${input.relatedVoucher.cuit.replace(/\D/g, '')}</Cuit>` : ''}
            </CbteAsoc>
          </CbtesAsoc>`
      : '';

    const feDetReq = `<FECAEDetRequest>
          <Concepto>1</Concepto>
          <DocTipo>${docTipo}</DocTipo>
          <DocNro>${docNro}</DocNro>
          <CbteDesde>${nextNumber}</CbteDesde>
          <CbteHasta>${nextNumber}</CbteHasta>
          <CbteFch>${cbteFch}</CbteFch>
          <ImpTotal>${amounts.impTotal}</ImpTotal>
          <ImpTotConc>${amounts.impTotConc}</ImpTotConc>
          <ImpNeto>${amounts.impNeto}</ImpNeto>
          <ImpOpEx>${amounts.impOpEx}</ImpOpEx>
          <ImpIVA>${amounts.impIVA}</ImpIVA>
          <MonId>PES</MonId>
          <MonCotiz>1</MonCotiz>
          ${condicionIvaBlock}
          ${cbtesAsocBlock}
          ${ivaBlock}
        </FECAEDetRequest>`;

    const body = `${buildWsfeAuthBlock(auth.token, auth.sign, Number(input.cuit))}
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${input.puntoVenta}</PtoVta>
          <CbteTipo>${cbteTipo}</CbteTipo>
        </FeCabReq>
        <FeDetReq>${feDetReq}</FeDetReq>
      </FeCAEReq>`;

    const envelope = buildWsfeEnvelope('FECAESolicitar', body);
    const xml = await this.postSoap(
      environment,
      'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
      envelope,
    );

    return this.parseAuthorizationResponse(xml, input.puntoVenta, nextNumber);
  }

  private parseAuthorizationResponse(
    xml: string,
    puntoVenta: number,
    expectedNumber: number,
  ): AuthorizeInvoiceResult {
    const resultBlock = parseXmlTag(xml, 'FECAEDetResponse') ?? xml;
    const resultCode = parseXmlTag(resultBlock, 'Resultado');
    const cae = parseXmlTag(resultBlock, 'CAE') ?? undefined;
    const caeVtoRaw = parseXmlTag(resultBlock, 'CAEFchVto');

    const errors: string[] = [];
    const errMatches = [...resultBlock.matchAll(/<Err>([\s\S]*?)<\/Err>/gi)];
    for (const match of errMatches) {
      const code = parseXmlTag(match[1], 'Code');
      const msg = parseXmlTag(match[1], 'Msg');
      if (msg) errors.push(code ? `${code}: ${msg}` : msg);
    }

    const observations: string[] = [];
    const obsMatches = [...resultBlock.matchAll(/<Obs>([\s\S]*?)<\/Obs>/gi)];
    for (const match of obsMatches) {
      const msg = parseXmlTag(match[1], 'Msg');
      if (msg) observations.push(msg);
    }

    if (!resultCode && errors.length === 0) {
      const fault = parseSoapFault(xml);
      if (fault) errors.push(fault);
    }

    const success = resultCode === 'A' && Boolean(cae);
    let caeExpiresAt: Date | undefined;
    if (caeVtoRaw && caeVtoRaw.length === 8) {
      const year = Number(caeVtoRaw.slice(0, 4));
      const month = Number(caeVtoRaw.slice(4, 6)) - 1;
      const day = Number(caeVtoRaw.slice(6, 8));
      caeExpiresAt = new Date(year, month, day, 23, 59, 59);
    }

    if (!success && errors.length === 0) {
      errors.push('ARCA rechazó el comprobante sin detalle');
    }

    return {
      success,
      numero: success ? expectedNumber : undefined,
      cae,
      caeExpiresAt,
      puntoVenta,
      errors,
      observations,
      raw: {
        resultCode,
      },
    };
  }

  private async postSoap(
    environment: AfipEnvironment,
    soapAction: string,
    envelope: string,
  ): Promise<string> {
    const url = AFIP_WSFE_URL[environment];
    this.logger.debug(`WSFE ${soapAction} · env=${environment}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: soapAction,
      },
      body: envelope,
    });

    const body = await response.text();
    if (!response.ok) {
      this.logger.error(`WSFE HTTP ${response.status}: ${body.slice(0, 400)}`);
      throw new Error(`WSFE respondió HTTP ${response.status}`);
    }

    return body;
  }
}
