import { FiscalDocumentType } from '@prisma/client';
import { FiscalPdfService } from './fiscal-pdf.service';

describe('FiscalPdfService', () => {
  const service = new FiscalPdfService();

  it('generates a valid PDF buffer for INTERNAL_TICKET', async () => {
    const { buffer, filename } = await service.generate({
      type: FiscalDocumentType.INTERNAL_TICKET,
      status: 'AUTHORIZED',
      subtotal: 5000,
      ivaAmount: 0,
      total: 5000,
      createdAt: new Date('2026-07-10T12:00:00.000Z'),
      restaurantName: 'E2E Restaurante',
    });

    expect(buffer.slice(0, 5).toString('utf8')).toBe('%PDF-');
    expect(filename).toMatch(/comprobante-internal_ticket/i);
  });

  it('generates FACTURA_B PDF with CAE metadata and QR when data is complete', async () => {
    const { buffer, filename } = await service.generate({
      type: FiscalDocumentType.FACTURA_B,
      status: 'AUTHORIZED',
      puntoVenta: 1,
      numero: 42,
      cae: '71234567890123',
      caeExpiresAt: new Date('2026-12-31'),
      customerName: 'Cliente E2E',
      customerDocType: 'DNI',
      customerDocNumber: '30123456',
      subtotal: 5000,
      ivaAmount: 1050,
      total: 6050,
      createdAt: new Date('2026-07-10T12:00:00.000Z'),
      restaurantName: 'E2E Restaurante',
      restaurantTaxId: '30712345678',
      issuerRazonSocial: 'E2E Restaurante SRL',
      issuerPuntoVenta: 1,
      lineItems: [
        {
          description: 'Milanesa E2E',
          quantity: 1,
          unitPrice: 5000,
          subtotal: 5000,
        },
      ],
    });

    expect(buffer.slice(0, 5).toString('utf8')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2_000);
    expect(filename).toBe('comprobante-factura_b-0001_00000042.pdf');
  });
});
