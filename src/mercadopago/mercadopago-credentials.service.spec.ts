import { BadRequestException } from '@nestjs/common';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';

describe('MercadoPagoCredentialsService', () => {
  type TransactionMock = {
    restaurant: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    mercadoPagoCredential: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  let transaction: TransactionMock;
  let prisma: {
    $transaction: jest.Mock;
  };
  let encryptionService: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };
  let service: MercadoPagoCredentialsService;

  beforeEach(() => {
    transaction = {
      restaurant: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      mercadoPagoCredential: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback: any) => callback(transaction)),
    };

    encryptionService = {
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn((value: string) => value.replace('enc:', '')),
    };

    service = new MercadoPagoCredentialsService(
      prisma as any,
      encryptionService as any,
    );
  });

  it('setTokenAndEnableDigitalWallet habilita digital-wallet y preserva flags', async () => {
    transaction.restaurant.findUnique.mockResolvedValue({
      businessRules: {
        orders: { enabled: true },
        payment: {
          methods: ['cash', 'mercadopago', 'digital_wallet', 'debit'],
          requirePrepayment: true,
          acceptTips: false,
        },
      },
    });

    await service.setTokenAndEnableDigitalWallet(
      ' r1 ',
      ' TOKEN_1234 ',
      true,
      'pk_test',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(encryptionService.encrypt).toHaveBeenCalledWith('TOKEN_1234');

    expect(transaction.mercadoPagoCredential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId: 'r1' },
        create: expect.objectContaining({
          accessTokenCiphertext: 'enc:TOKEN_1234',
          accessTokenLast4: '1234',
          isSandbox: true,
          publishableKey: 'pk_test',
        }),
      }),
    );

    const updateCallArg = transaction.restaurant.update.mock.calls[0][0];
    const updatedBusinessRules = updateCallArg.data.businessRules as {
      orders?: { enabled?: boolean };
      payment: {
        methods: string[];
        requirePrepayment: boolean;
        acceptTips: boolean;
      };
    };

    expect(updatedBusinessRules.orders).toEqual({ enabled: true });
    expect(updatedBusinessRules.payment.requirePrepayment).toBe(true);
    expect(updatedBusinessRules.payment.acceptTips).toBe(false);
    expect(updatedBusinessRules.payment.methods).toEqual(
      expect.arrayContaining(['cash', 'digital-wallet', 'debit-card']),
    );
    expect(
      updatedBusinessRules.payment.methods.filter(
        (method) => method === 'digital-wallet',
      ),
    ).toHaveLength(1);
  });

  it('clearTokenAndDisableDigitalWallet deshabilita digital-wallet y aplica defaults', async () => {
    transaction.restaurant.findUnique.mockResolvedValue({
      businessRules: {
        payment: {
          methods: ['cash', 'mercadopago'],
        },
      },
    });

    await service.clearTokenAndDisableDigitalWallet(' r1 ');

    expect(transaction.mercadoPagoCredential.deleteMany).toHaveBeenCalledWith({
      where: { restaurantId: 'r1' },
    });

    const updateCallArg = transaction.restaurant.update.mock.calls[0][0];
    const updatedBusinessRules = updateCallArg.data.businessRules as {
      payment: {
        methods: string[];
        requirePrepayment: boolean;
        acceptTips: boolean;
      };
    };

    expect(updatedBusinessRules.payment.methods).toEqual(['cash']);
    expect(updatedBusinessRules.payment.requirePrepayment).toBe(false);
    expect(updatedBusinessRules.payment.acceptTips).toBe(true);
  });

  it('falla si restaurantId no existe en la transaccion', async () => {
    transaction.restaurant.findUnique.mockResolvedValue(null);

    await expect(
      service.setTokenAndEnableDigitalWallet('r1', 'TOKEN_1234'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.mercadoPagoCredential.upsert).not.toHaveBeenCalled();
    expect(transaction.restaurant.update).not.toHaveBeenCalled();
  });

  it('valida parametros requeridos', async () => {
    await expect(
      service.setTokenAndEnableDigitalWallet('', 'TOKEN_1234'),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.setTokenAndEnableDigitalWallet('r1', ''),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.clearTokenAndDisableDigitalWallet(''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
