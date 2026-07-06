import { BadRequestException } from '@nestjs/common';
import { GoLiveEnforcementService } from './go-live-enforcement.service';

describe('GoLiveEnforcementService', () => {
  const prisma = {
    restaurant: {
      findUnique: jest.fn(),
    },
    mercadoPagoCredential: {
      findUnique: jest.fn(),
    },
    order: {
      count: jest.fn(),
    },
  };

  const service = new GoLiveEnforcementService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.mercadoPagoCredential.findUnique.mockResolvedValue(null);
    prisma.order.count.mockResolvedValue(0);
  });

  it('bloquea publicar si faltan datos básicos del gate', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      name: 'Demo',
      type: 'restaurant',
      phone: '111',
      address: 'Calle 1',
      logo: null,
      isPublished: false,
      branding: null,
      businessRules: { payment: { methods: [] } },
      _count: { dishes: 0 },
    });

    await expect(service.assertCanPublish('r1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('permite publicar con nombre, contacto y carta aunque falten cobros', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      name: 'Demo',
      type: 'restaurant',
      phone: '111',
      address: 'Calle 1',
      logo: null,
      isPublished: false,
      branding: null,
      businessRules: { payment: { methods: [] } },
      _count: { dishes: 2 },
    });

    await expect(service.assertCanPublish('r1')).resolves.toBeUndefined();
  });

  it('permite publicar si el sitio ya está publicado', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      name: 'Demo',
      type: 'restaurant',
      phone: '111',
      address: 'Calle 1',
      logo: 'logo.png',
      isPublished: true,
      branding: { theme: { colors: { primary: '#000' } } },
      businessRules: { payment: { methods: [] } },
      _count: { dishes: 0 },
    });

    await expect(service.assertCanPublish('r1')).resolves.toBeUndefined();
  });

  it('bloquea activar MP si falta menú', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      name: 'Demo',
      type: 'restaurant',
      phone: '111',
      address: 'Calle 1',
      logo: null,
      isPublished: false,
      branding: null,
      businessRules: { payment: { methods: [] } },
      _count: { dishes: 0 },
    });

    await expect(
      service.assertCanEnableDigitalWallet('r1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'GO_LIVE_MP_ENABLE_BLOCKED',
      }),
    });
  });

  it('permite activar MP con prerrequisitos básicos', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      name: 'Demo',
      type: 'restaurant',
      phone: '111',
      address: 'Calle 1',
      logo: null,
      isPublished: false,
      branding: null,
      businessRules: { payment: { methods: [] } },
      _count: { dishes: 3 },
    });

    await expect(
      service.assertCanEnableDigitalWallet('r1'),
    ).resolves.toBeUndefined();
  });
});
