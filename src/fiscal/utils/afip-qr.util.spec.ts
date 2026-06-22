import { FiscalDocumentType } from '@prisma/client';
import {
  buildAfipQrPayload,
  buildAfipQrUrl,
  formatAfipQrDate,
} from './afip-qr.util';

describe('afip-qr.util', () => {
  it('formatea fecha AFIP', () => {
    expect(formatAfipQrDate(new Date('2026-06-21T15:30:00'))).toBe('20260621');
  });

  it('arma payload QR con CAE y comprobante', () => {
    const payload = buildAfipQrPayload({
      createdAt: new Date('2026-06-21T12:00:00'),
      cuit: '20123456789',
      puntoVenta: 3,
      numero: 42,
      type: FiscalDocumentType.FACTURA_B,
      total: 12100,
      cae: '71234567890123',
      customerDocType: 'DNI',
      customerDocNumber: '30123456',
    });

    expect(payload).toMatchObject({
      ver: 1,
      fecha: '20260621',
      cuit: 20123456789,
      ptoVta: 3,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 12100,
      moneda: 'PES',
      tipoCodAut: 'E',
      codAut: 71234567890123,
    });
  });

  it('genera URL AFIP codificada', () => {
    const url = buildAfipQrUrl({
      createdAt: new Date('2026-06-21T12:00:00'),
      cuit: '20123456789',
      puntoVenta: 1,
      numero: 10,
      type: FiscalDocumentType.FACTURA_B,
      total: 5000,
      cae: '71234567890123',
    });

    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true);
  });
});
