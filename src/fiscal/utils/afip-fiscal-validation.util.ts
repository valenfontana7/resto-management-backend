import { FiscalDocumentType } from '@prisma/client';
import type { IssuerIvaCondition } from './afip.constants';
import { isValidCuit, normalizeCuit } from './afip-cuit.util';

export function getAvailableFiscalTypes(
  issuerIvaCondition?: IssuerIvaCondition | null,
): FiscalDocumentType[] {
  switch (issuerIvaCondition) {
    case 'MONOTRIBUTO':
    case 'EXENTO':
      return [FiscalDocumentType.FACTURA_C];
    case 'RESPONSABLE_INSCRIPTO':
    default:
      return [
        FiscalDocumentType.FACTURA_A,
        FiscalDocumentType.FACTURA_B,
        FiscalDocumentType.FACTURA_C,
      ];
  }
}

export function requiresCuitForType(type: FiscalDocumentType): boolean {
  return type === FiscalDocumentType.FACTURA_A;
}

export function validateFiscalCustomerInput(input: {
  type: FiscalDocumentType;
  customerDocType?: string | null;
  customerDocNumber?: string | null;
  customerIvaCondition?: number | null;
}): string[] {
  const errors: string[] = [];

  if (input.type === FiscalDocumentType.INTERNAL_TICKET) {
    return errors;
  }

  if (requiresCuitForType(input.type)) {
    const docType = (input.customerDocType ?? '').trim().toUpperCase();
    const cuit = normalizeCuit(input.customerDocNumber ?? '');

    if (docType !== 'CUIT') {
      errors.push('Factura A requiere CUIT del cliente');
    }
    if (!isValidCuit(cuit)) {
      errors.push('CUIT del cliente inválido');
    }
    if (!input.customerIvaCondition) {
      errors.push('Factura A requiere condición IVA del receptor');
    }
    return errors;
  }

  const docType = mapCustomerDocTypeCode(input.customerDocType);
  const docNumber = normalizeCuit(input.customerDocNumber ?? '');

  if (docType !== 99 && !docNumber) {
    errors.push('Ingresá el número de documento del cliente');
  }

  if (docType === 80 && !isValidCuit(docNumber)) {
    errors.push('CUIT del cliente inválido');
  }

  return errors;
}

function mapCustomerDocTypeCode(docType?: string | null): number {
  if (!docType) return 99;
  const normalized = docType.trim().toUpperCase();
  if (normalized === 'CUIT') return 80;
  if (normalized === 'DNI') return 96;
  return 99;
}
