import { Test, TestingModule } from '@nestjs/testing';
import { CrossEngineFrequencyService } from './cross-engine-frequency.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CrossEngineFrequencyService', () => {
  let service: CrossEngineFrequencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossEngineFrequencyService,
        {
          provide: PrismaService,
          useValue: {
            engagementDelivery: { count: jest.fn(), findFirst: jest.fn() },
            lifecycleDelivery: { count: jest.fn(), findFirst: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get(CrossEngineFrequencyService);
  });

  it('assigns REC-GOL-01 to lifecycle_marketing', () => {
    const result = service.assertEngineOwnership(
      'REC-GOL-01',
      'lifecycle_marketing',
    );
    expect(result.allowed).toBe(true);
  });

  it('blocks CE for REC-GOL-01', () => {
    const result = service.assertEngineOwnership(
      'REC-GOL-01',
      'customer_engagement',
    );
    expect(result.allowed).toBe(false);
    expect(result.primaryEngine).toBe('lifecycle_marketing');
  });

  it('allows unknown REC on both engines', () => {
    expect(
      service.assertEngineOwnership('REC-UNKNOWN', 'customer_engagement')
        .allowed,
    ).toBe(true);
    expect(
      service.assertEngineOwnership('REC-UNKNOWN', 'lifecycle_marketing')
        .allowed,
    ).toBe(true);
  });
});
