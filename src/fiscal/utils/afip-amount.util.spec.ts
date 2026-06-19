import { FiscalDocumentType } from '@prisma/client';
import {
  buildAfipAmounts,
  mapCustomerDocType,
  mapCustomerDocNumber,
  mapFiscalDocumentType,
  mapCreditNoteCbteType,
} from './afip-amount.util';

describe('afip-amount.util', () => {
  it('calculates IVA 21% for Factura A', () => {
    const amounts = buildAfipAmounts(FiscalDocumentType.FACTURA_A, 1210);
    expect(amounts.impTotal).toBe(1210);
    expect(amounts.impNeto).toBe(1000);
    expect(amounts.impIVA).toBe(210);
  });

  it('calculates IVA 21% for Factura B', () => {
    const amounts = buildAfipAmounts(FiscalDocumentType.FACTURA_B, 1210);
    expect(amounts.impTotal).toBe(1210);
    expect(amounts.impNeto).toBe(1000);
    expect(amounts.impIVA).toBe(210);
  });

  it('uses full total as neto for Factura C', () => {
    const amounts = buildAfipAmounts(FiscalDocumentType.FACTURA_C, 5000);
    expect(amounts.impTotal).toBe(5000);
    expect(amounts.impNeto).toBe(5000);
    expect(amounts.impIVA).toBe(0);
  });

  it('maps AFIP cbte types including credit notes', () => {
    expect(mapFiscalDocumentType(FiscalDocumentType.FACTURA_A)).toBe(1);
    expect(mapFiscalDocumentType(FiscalDocumentType.FACTURA_B)).toBe(6);
    expect(mapFiscalDocumentType(FiscalDocumentType.FACTURA_C)).toBe(11);
    expect(mapCreditNoteCbteType(FiscalDocumentType.FACTURA_A)).toBe(3);
    expect(mapCreditNoteCbteType(FiscalDocumentType.FACTURA_B)).toBe(8);
    expect(mapCreditNoteCbteType(FiscalDocumentType.FACTURA_C)).toBe(13);
  });

  it('maps customer document types', () => {
    expect(mapCustomerDocType('CUIT')).toBe(80);
    expect(mapCustomerDocType('DNI')).toBe(96);
    expect(mapCustomerDocNumber(99, null)).toBe(0);
    expect(mapCustomerDocNumber(96, '12.345.678')).toBe(12345678);
  });
});
