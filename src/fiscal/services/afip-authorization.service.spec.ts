import { FiscalDocumentType } from '@prisma/client';
import { AfipAuthorizationService } from './afip-authorization.service';
import { FiscalConfigService } from './fiscal-config.service';
import { AfipWsaaService } from './afip-wsaa.service';
import { AfipWsfeService } from './afip-wsfe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LabEffectsPolicyService } from '../../bentoo-lab/effects/lab-effects-policy.service';

describe('AfipAuthorizationService.authorize', () => {
  const originalRuntimeMode = process.env.BENTOO_RUNTIME_MODE;

  afterEach(() => {
    process.env.BENTOO_RUNTIME_MODE = originalRuntimeMode;
    jest.restoreAllMocks();
  });

  function buildService(overrides?: {
    publicConfig?: Record<string, unknown> | null;
    credentials?: { certificatePem: string; privateKeyPem: string } | null;
  }) {
    const getPublicConfig = jest.fn().mockResolvedValue(
      overrides?.publicConfig ?? {
        cuit: '30712345678',
        puntoVenta: 7,
        availableDocumentTypes: ['FACTURA_B'],
        environment: 'homologacion',
        certificateConfigured: true,
        ivaRate: 21,
      },
    );
    const getDecryptedCredentials = jest.fn().mockResolvedValue(
      overrides?.credentials ?? {
        certificatePem: 'CERT',
        privateKeyPem: 'KEY',
      },
    );
    const fiscalConfig = {
      getPublicConfig,
      getDecryptedCredentials,
    } as unknown as FiscalConfigService;

    const getCredentials = jest.fn().mockResolvedValue({
      token: 'token',
      sign: 'sign',
      expirationTime: new Date('2099-01-01T00:00:00.000Z'),
    });
    const wsaa = { getCredentials } as unknown as AfipWsaaService;

    const authorizeInvoice = jest.fn().mockResolvedValue({
      success: true,
      numero: 2,
      cae: 'REAL-CAE',
      caeExpiresAt: new Date('2099-01-02T00:00:00.000Z'),
      puntoVenta: 7,
      errors: [],
      observations: [],
    });
    const wsfe = { authorizeInvoice } as unknown as AfipWsfeService;

    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $executeRaw: executeRaw,
    } as unknown as PrismaService;

    return {
      service: new AfipAuthorizationService(fiscalConfig, wsaa, wsfe, prisma),
      getPublicConfig,
      getDecryptedCredentials,
      getCredentials,
      authorizeInvoice,
      executeRaw,
    };
  }

  it('usa stub Lab sin pedir credenciales ni SOAP', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'lab';

    const authorize = jest
      .fn()
      .mockReturnValue({ allowed: false, result: 'BLOCKED' });
    const labEffects = { authorize } as unknown as LabEffectsPolicyService;

    const {
      service,
      getPublicConfig,
      getDecryptedCredentials,
      getCredentials,
      authorizeInvoice,
    } = buildService();
    (service as any).labEffects = labEffects;

    const result = await service.authorize({
      restaurantId: 'rest-123',
      type: FiscalDocumentType.FACTURA_B,
      totalPesos: 1000,
    });

    expect(getPublicConfig).toHaveBeenCalledWith('rest-123');
    expect(authorize).toHaveBeenCalledWith('FISCAL_ARCA', {
      detail: 'lab-stub',
    });
    expect(getDecryptedCredentials).not.toHaveBeenCalled();
    expect(getCredentials).not.toHaveBeenCalled();
    expect(authorizeInvoice).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      numero: 1,
      cae: 'LAB-CAE-rest1230',
      caeExpiresAt: new Date('2099-12-31T23:59:59.000Z'),
      puntoVenta: 7,
      errors: [],
      observations: [],
    });
  });

  it('conserva la ruta normal con credenciales y SOAP', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'normal';

    const {
      service,
      getDecryptedCredentials,
      getCredentials,
      authorizeInvoice,
      executeRaw,
    } = buildService();
    const result = await service.authorize({
      restaurantId: 'rest-123',
      type: FiscalDocumentType.FACTURA_B,
      totalPesos: 1000,
    });

    expect(getDecryptedCredentials).toHaveBeenCalledWith('rest-123');
    expect(getCredentials).toHaveBeenCalledWith(
      '30712345678',
      'CERT',
      'KEY',
      'homologacion',
    );
    expect(authorizeInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'token',
        sign: 'sign',
      }),
      expect.objectContaining({
        cuit: '30712345678',
        puntoVenta: 7,
        totalPesos: 1000,
      }),
    );
    expect(executeRaw).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      numero: 2,
      cae: 'REAL-CAE',
      caeExpiresAt: new Date('2099-01-02T00:00:00.000Z'),
      puntoVenta: 7,
      errors: [],
      observations: [],
    });
  });
});
