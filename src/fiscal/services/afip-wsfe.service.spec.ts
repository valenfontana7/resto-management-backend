import { AfipWsfeService } from '../services/afip-wsfe.service';
import { FiscalDocumentType } from '@prisma/client';

describe('AfipWsfeService (mock SOAP)', () => {
  const service = new AfipWsfeService();
  const auth = { token: 'token', sign: 'sign', expirationTime: new Date() };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('authorizes invoice using mocked FECompUltimoAutorizado + FECAESolicitar', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<soap:Envelope><soap:Body><FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><CbteNro>10</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></soap:Body></soap:Envelope>',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<soap:Envelope><soap:Body><FECAESolicitarResponse><FECAESolicitarResult><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>20261231</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>',
      } as Response);

    const result = await service.authorizeInvoice(auth, {
      cuit: '20123456789',
      puntoVenta: 1,
      type: FiscalDocumentType.FACTURA_B,
      totalPesos: 1210,
      environment: 'homologacion',
      ivaRate: 21,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.numero).toBe(11);
    expect(result.cae).toBe('12345678901234');
  });
});
