import { AiProvider } from '@prisma/client';
import { CostEngineService } from './cost-engine.service';

describe('CostEngineService', () => {
  const prisma = {
    aiModelPricing: {
      findFirst: jest.fn(),
    },
    aiCostBudget: {
      findUnique: jest.fn(),
    },
    aiTaskExecution: {
      aggregate: jest.fn(),
    },
  };

  let service: CostEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CostEngineService(prisma as never);
  });

  it('calculates cost from pricing table', async () => {
    prisma.aiModelPricing.findFirst.mockResolvedValue({
      inputPerMillion: 0.15,
      outputPerMillion: 0.6,
      reasoningPerMillion: null,
    });

    const result = await service.calculateCost(
      AiProvider.GEMINI,
      'gemini-2.5-flash',
      {
        promptTokens: 1000,
        completionTokens: 500,
      },
    );

    expect(result.inputCostUsd).toBeCloseTo(0.00015, 6);
    expect(result.outputCostUsd).toBeCloseTo(0.0003, 6);
    expect(result.totalCostUsd).toBeCloseTo(0.00045, 6);
  });

  it('returns zero cost when pricing missing', async () => {
    prisma.aiModelPricing.findFirst.mockResolvedValue(null);

    const result = await service.calculateCost(
      AiProvider.GEMINI,
      'unknown-model',
      {
        promptTokens: 1000,
        completionTokens: 500,
      },
    );

    expect(result.totalCostUsd).toBe(0);
  });
});
