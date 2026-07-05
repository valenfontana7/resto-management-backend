import { NotFoundException } from '@nestjs/common';
import { RestaurantRefResolverService } from './restaurant-ref-resolver.service';

describe('RestaurantRefResolverService', () => {
  const prisma = {
    restaurant: {
      findUnique: jest.fn(),
    },
  };

  let service: RestaurantRefResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RestaurantRefResolverService(prisma as never);
  });

  it('resuelve por id', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce({ id: 'cuid123' });

    await expect(service.resolveRestaurantId('cuid123')).resolves.toBe(
      'cuid123',
    );
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith({
      where: { id: 'cuid123' },
      select: { id: true },
    });
  });

  it('resuelve por slug en minúsculas', async () => {
    prisma.restaurant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'cuid456' });

    await expect(service.resolveRestaurantId('La-Parrilla')).resolves.toBe(
      'cuid456',
    );
    expect(prisma.restaurant.findUnique).toHaveBeenLastCalledWith({
      where: { slug: 'la-parrilla' },
      select: { id: true },
    });
  });

  it('falla si no existe', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveRestaurantId('no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
