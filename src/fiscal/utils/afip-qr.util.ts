import { FiscalDocumentType } from '@prisma/client';
import {
  mapCustomerDocNumber,
  mapCustomerDocType,
  mapFiscalDocumentType,
  toAfipAmount,
} from './afip-amount.util';

export interface AfipQrInput {
  createdAt: Date;
  cuit: string;
  puntoVenta: number;
  numero: number;
  type: FiscalDocumentType;
  total: number;
  cae: string;
  customerDocType?: string | null;
  customerDocNumber?: string | null;
  relatedInvoiceType?: FiscalDocumentType | null;
}

export function formatAfipQrDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function buildAfipQrPayload(
  input: AfipQrInput,
): Record<string, unknown> {
  const docType = mapCustomerDocType(input.customerDocType);
  return {
    ver: 1,
    fecha: formatAfipQrDate(input.createdAt),
    cuit: Number(input.cuit.replace(/\D/g, '')),
    ptoVta: input.puntoVenta,
    tipoCmp: mapFiscalDocumentType(input.type, input.relatedInvoiceType),
    nroCmp: input.numero,
    importe: toAfipAmount(input.total),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: docType,
    nroDocRec: mapCustomerDocNumber(docType, input.customerDocNumber),
    tipoCodAut: 'E',
    codAut: Number(String(input.cae).replace(/\D/g, '')),
  };
}

export function buildAfipQrUrl(input: AfipQrInput): string {
  const payload = buildAfipQrPayload(input);
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${encoded}`;
}
