import { FiscalDocumentType } from '@prisma/client';
import { AFIP_CBTE_TYPE } from './afip.constants';

export interface AfipInvoiceAmounts {
  impTotal: number;
  impNeto: number;
  impIVA: number;
  impTotConc: number;
  impOpEx: number;
  ivaBase: number;
}

/**
 * Convierte montos del POS (pesos enteros) a decimales AFIP (2 decimales).
 */
export function toAfipAmount(pesos: number): number {
  return Math.round(pesos * 100) / 100;
}

export function isIvaDiscriminated(type: FiscalDocumentType): boolean {
  return (
    type === FiscalDocumentType.FACTURA_A ||
    type === FiscalDocumentType.FACTURA_B ||
    type === FiscalDocumentType.NOTA_CREDITO
  );
}

/**
 * Calcula importes para WSFEv1 según tipo de comprobante.
 * Factura A/B discrimina IVA 21%; Factura C no lleva IVA.
 * Nota de crédito usa la misma lógica que la factura asociada.
 */
export function buildAfipAmounts(
  type: FiscalDocumentType,
  totalPesos: number,
  relatedInvoiceType?: FiscalDocumentType | null,
  ivaRate = 21,
): AfipInvoiceAmounts {
  const effectiveType =
    type === FiscalDocumentType.NOTA_CREDITO
      ? (relatedInvoiceType ?? FiscalDocumentType.FACTURA_B)
      : type;

  const impTotal = toAfipAmount(totalPesos);

  if (
    effectiveType === FiscalDocumentType.FACTURA_C ||
    !isIvaDiscriminated(effectiveType)
  ) {
    return {
      impTotal,
      impNeto: impTotal,
      impIVA: 0,
      impTotConc: 0,
      impOpEx: 0,
      ivaBase: 0,
    };
  }

  const divisor = 1 + Math.max(0, ivaRate) / 100;
  const impNeto = toAfipAmount(impTotal / divisor);
  const impIVA = toAfipAmount(impTotal - impNeto);

  return {
    impTotal,
    impNeto,
    impIVA,
    impTotConc: 0,
    impOpEx: 0,
    ivaBase: impNeto,
  };
}

export function mapCustomerDocType(docType?: string | null): number {
  if (!docType) return 99;
  const normalized = docType.trim().toUpperCase();
  if (normalized === 'CUIT') return 80;
  if (normalized === 'DNI') return 96;
  return 99;
}

export function mapCustomerDocNumber(
  docType: number,
  docNumber?: string | null,
): number {
  if (docType === 99) return 0;
  const digits = (docNumber ?? '').replace(/\D/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapFiscalDocumentType(
  type: FiscalDocumentType,
  relatedInvoiceType?: FiscalDocumentType | null,
): number {
  if (type === FiscalDocumentType.NOTA_CREDITO) {
    return mapCreditNoteCbteType(relatedInvoiceType);
  }

  switch (type) {
    case FiscalDocumentType.FACTURA_A:
      return AFIP_CBTE_TYPE.FACTURA_A;
    case FiscalDocumentType.FACTURA_C:
      return AFIP_CBTE_TYPE.FACTURA_C;
    case FiscalDocumentType.FACTURA_B:
    default:
      return AFIP_CBTE_TYPE.FACTURA_B;
  }
}

export function mapCreditNoteCbteType(
  relatedInvoiceType?: FiscalDocumentType | null,
): number {
  switch (relatedInvoiceType) {
    case FiscalDocumentType.FACTURA_A:
      return AFIP_CBTE_TYPE.NOTA_CREDITO_A;
    case FiscalDocumentType.FACTURA_C:
      return AFIP_CBTE_TYPE.NOTA_CREDITO_C;
    case FiscalDocumentType.FACTURA_B:
    default:
      return AFIP_CBTE_TYPE.NOTA_CREDITO_B;
  }
}

export function mapInvoiceTypeToCreditNoteType(): FiscalDocumentType {
  return FiscalDocumentType.NOTA_CREDITO;
}
