import { NotFoundException } from '@nestjs/common';
import { OwnershipService } from '../../common/services/ownership.service';
import { RestaurantRefResolverService } from './restaurant-ref-resolver.service';

describe('RestaurantRefResolverService', () => {
  const ownership = {
    resolveRestaurantId: jest.fn(),
  };

  let service: RestaurantRefResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RestaurantRefResolverService(
      ownership as unknown as OwnershipService,
    );
  });

  it('resuelve por id', async () => {
    ownership.resolveRestaurantId.mockResolvedValueOnce('cuid123');

    await expect(service.resolveRestaurantId('cuid123')).resolves.toBe(
      'cuid123',
    );
    expect(ownership.resolveRestaurantId).toHaveBeenCalledWith('cuid123');
  });

  it('resuelve por slug en minúsculas', async () => {
    ownership.resolveRestaurantId.mockResolvedValueOnce('cuid456');

    await expect(service.resolveRestaurantId('La-Parrilla')).resolves.toBe(
      'cuid456',
    );
    expect(ownership.resolveRestaurantId).toHaveBeenCalledWith('La-Parrilla');
  });

  it('falla si no existe', async () => {
    ownership.resolveRestaurantId.mockRejectedValueOnce(
      new NotFoundException('Restaurante no encontrado'),
    );

    await expect(
      service.resolveRestaurantId('no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
