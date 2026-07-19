import { LabSafetyService } from './lab-safety.service';

describe('LabSafetyService', () => {
  const policy = {
    assertStartupPolicyComplete: jest.fn(),
  };

  beforeEach(() => {
    policy.assertStartupPolicyComplete.mockClear();
  });

  it('verifica la identidad real de la base antes de habilitar Lab', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          databaseName: 'bentoo_lab',
          serverAddress: '127.0.0.1/32',
        },
      ]),
    };
    const service = new LabSafetyService(prisma as never, policy as never, {
      BENTOO_RUNTIME_MODE: 'lab',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/bentoo_lab',
    });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(policy.assertStartupPolicyComplete).toHaveBeenCalledTimes(1);
  });

  it('aborta si la conexión resuelve a otra base', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          databaseName: 'bentoo',
          serverAddress: '127.0.0.1',
        },
      ]),
    };
    const service = new LabSafetyService(prisma as never, policy as never, {
      BENTOO_RUNTIME_MODE: 'lab',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/bentoo_lab',
    });

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      /base exclusiva/i,
    );
  });

  it('no consulta la base fuera de Lab', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
    };
    const service = new LabSafetyService(prisma as never, policy as never, {});

    await service.onApplicationBootstrap();

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
