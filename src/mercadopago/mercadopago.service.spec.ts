import { ConfigService } from '@nestjs/config';
import { MercadoPagoService } from './mercadopago.service';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import { LabEffectsPolicyService } from '../bentoo-lab/effects/lab-effects-policy.service';

describe('MercadoPagoService.createPreference', () => {
  const originalRuntimeMode = process.env.BENTOO_RUNTIME_MODE;

  afterEach(() => {
    process.env.BENTOO_RUNTIME_MODE = originalRuntimeMode;
    jest.restoreAllMocks();
  });

  it('usa stub Lab sin llamar fetch ni resolveAccessToken', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'lab';

    const authorize = jest
      .fn()
      .mockReturnValue({ allowed: false, result: 'BLOCKED' });
    const labEffects = { authorize } as unknown as LabEffectsPolicyService;

    const service = new MercadoPagoService(
      {
        get: jest.fn((key: string) => {
          if (key === 'BACKEND_URL') return 'http://127.0.0.1:4400';
          return '';
        }),
      } as unknown as ConfigService,
      {} as PrismaService,
      {} as MercadoPagoCredentialsService,
      labEffects,
    );

    const resolvePreferenceSourceSpy = jest.spyOn(
      service as any,
      'resolvePreferenceSource',
    );

    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any);

    const result = await service.createPreference('http://localhost:3000', {
      orderId: 'order-123',
    });

    expect(authorize).toHaveBeenCalledWith('PAYMENT_MERCADOPAGO', {
      detail: 'lab-stub',
    });
    expect(resolvePreferenceSourceSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      preference: {
        id: 'lab-pref-order-123',
        init_point:
          'http://127.0.0.1:4400/api/lab/mercadopago/preferences/lab-pref-order-123',
        sandbox_init_point:
          'http://127.0.0.1:4400/api/lab/mercadopago/sandbox/lab-pref-order-123',
      },
      isSandbox: true,
    });
  });

  it('conserva la ruta normal y llama fetch con token', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'normal';

    const service = new MercadoPagoService(
      {
        get: jest.fn((key: string) => {
          if (key === 'FRONTEND_URL') return 'http://frontend.example';
          if (key === 'BASE_URL') return '';
          if (key === 'MERCADOPAGO_NOTIFICATION_URL') return '';
          return '';
        }),
      } as unknown as ConfigService,
      {
        mercadoPagoCredential: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService,
      {} as MercadoPagoCredentialsService,
    );

    const resolvePreferenceSourceSpy = jest
      .spyOn(service as any, 'resolvePreferenceSource')
      .mockResolvedValue({
        restaurantId: 'rest-1',
        slug: 'pizzeria',
        orderId: 'order-123',
        items: [{ title: 'Pizza', quantity: 1, unit_price: 2500 }],
        customerName: 'Juan Perez',
        customerEmail: 'juan@example.com',
        restaurantName: 'Pizzería Bentoo',
      });
    const resolveAccessTokenSpy = jest
      .spyOn(service as any, 'resolveAccessToken')
      .mockResolvedValue('mp-token');
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pref-1',
        init_point: 'https://mp.example/init',
        sandbox_init_point: 'https://mp.example/sandbox',
      }),
    } as Response);

    const result = await service.createPreference('http://localhost:3000', {
      orderId: 'order-123',
    });

    expect(resolvePreferenceSourceSpy).toHaveBeenCalled();
    expect(resolveAccessTokenSpy).toHaveBeenCalledWith('rest-1', false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      preference: {
        id: 'pref-1',
        init_point: 'https://mp.example/init',
        sandbox_init_point: 'https://mp.example/sandbox',
      },
      isSandbox: false,
    });
  });
});
