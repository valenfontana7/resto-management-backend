import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { BusinessEventPublisherService } from '../business-events/business-event-publisher.service';

describe('InventoryService.applyStockAvailability', () => {
  let service: InventoryService;
  let prisma: {
    inventoryItem: { findMany: jest.Mock };
    dish: { findMany: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      inventoryItem: { findMany: jest.fn() },
      dish: { findMany: jest.fn(), updateMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OwnershipService,
          useValue: { verifyUserBelongsToRestaurant: jest.fn() },
        },
        {
          provide: BusinessEventPublisherService,
          useValue: {
            publish: jest.fn().mockResolvedValue({}),
            publishDeduped: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('deshabilita platos vinculados cuando el insumo está en quiebre', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      { currentStock: 0, linkedDishIds: ['dish-1', 'dish-2'] },
    ]);
    prisma.dish.findMany
      .mockResolvedValueOnce([{ id: 'dish-1' }, { id: 'dish-2' }])
      .mockResolvedValueOnce([]);

    const result = await service.applyStockAvailability('rest-1');

    expect(prisma.dish.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['dish-1', 'dish-2'] } },
      data: { isAvailable: false, autoDisabledByStock: true },
    });
    expect(result.disabledDishIds).toEqual(['dish-1', 'dish-2']);
    expect(result.reEnabledDishIds).toEqual([]);
  });

  it('reactiva platos auto-deshabilitados cuando el stock se repone', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      { currentStock: 5, linkedDishIds: ['dish-1'] },
    ]);
    prisma.dish.findMany.mockResolvedValueOnce([{ id: 'dish-1' }]);

    const result = await service.applyStockAvailability('rest-1');

    expect(prisma.dish.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['dish-1'] } },
      data: { isAvailable: true, autoDisabledByStock: false },
    });
    expect(result.reEnabledDishIds).toEqual(['dish-1']);
  });

  it('no reactiva platos deshabilitados manualmente', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      { currentStock: 10, linkedDishIds: ['dish-1'] },
    ]);
    prisma.dish.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await service.applyStockAvailability('rest-1');

    expect(prisma.dish.updateMany).not.toHaveBeenCalled();
    expect(result.reEnabledDishIds).toEqual([]);
  });

  it('ignora insumos sin autocorte activado', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([]);
    prisma.dish.findMany.mockResolvedValue([]);

    const result = await service.applyStockAvailability('rest-1');

    expect(prisma.dish.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ disabledDishIds: [], reEnabledDishIds: [] });
  });
});
