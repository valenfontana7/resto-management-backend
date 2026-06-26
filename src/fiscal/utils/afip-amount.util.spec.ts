import { buildAfipAmounts } from './afip-amount.util';
import { FiscalDocumentType } from '@prisma/client';

describe('buildAfipAmounts configurable IVA', () => {
  it('uses default 21% when rate omitted', () => {
    const amounts = buildAfipAmounts(FiscalDocumentType.FACTURA_B, 12100);
    expect(amounts.impNeto).toBe(10000);
    expect(amounts.impIVA).toBe(2100);
  });

  it('supports custom IVA rate', () => {
    const amounts = buildAfipAmounts(
      FiscalDocumentType.FACTURA_B,
      11000,
      null,
      10,
    );
    expect(amounts.impNeto).toBe(10000);
    expect(amounts.impIVA).toBe(1000);
  });
});
