import { DeliveryPricingService } from './delivery-pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodeService } from './geocode.service';

describe('DeliveryPricingService', () => {
  const palermoRing = [
    { lat: -34.6, lng: -58.4 },
    { lat: -34.6, lng: -58.39 },
    { lat: -34.61, lng: -58.39 },
    { lat: -34.61, lng: -58.4 },
  ];

  const prisma = {
    restaurant: { findUnique: jest.fn() },
    deliveryZone: { findMany: jest.fn() },
    deliveryPlatform: { findFirst: jest.fn() },
  };

  const geocodeService = {
    coordinatesForDeliveryAddress: jest.fn(),
  };

  let service: DeliveryPricingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeliveryPricingService(
      prisma as unknown as PrismaService,
      geocodeService as unknown as GeocodeService,
    );

    prisma.restaurant.findUnique.mockResolvedValue({
      businessRules: { delivery: { enabled: true } },
      features: { delivery: true },
      city: 'Buenos Aires',
      country: 'AR',
    });
    prisma.deliveryPlatform.findFirst.mockResolvedValue(null);
  });

  it('returns out-of-zone when coordinates fall outside all polygons', async () => {
    prisma.deliveryZone.findMany.mockResolvedValue([
      {
        id: 'zone-palermo',
        name: 'Palermo',
        deliveryFee: 1200,
        minOrder: 8000,
        estimatedTime: '30 min',
        areas: ['Palermo'],
        polygon: { rings: [palermoRing], source: 'manual' },
      },
    ]);

    const quote = await service.quoteDelivery('rest-1', {
      type: 'delivery',
      subtotal: 10000,
      lat: -34.59,
      lng: -58.395,
    });

    expect(quote.available).toBe(false);
    expect(quote.matchedBy).toBe('out-of-zone');
    expect(quote.zone).toBeNull();
    expect(quote.message).toContain('fuera de nuestra zona');
  });

  it('matches zone by coordinates inside polygon', async () => {
    prisma.deliveryZone.findMany.mockResolvedValue([
      {
        id: 'zone-palermo',
        name: 'Palermo',
        deliveryFee: 1200,
        minOrder: 8000,
        estimatedTime: '30 min',
        areas: ['Palermo'],
        polygon: { rings: [palermoRing], source: 'manual' },
      },
    ]);

    const quote = await service.quoteDelivery('rest-1', {
      type: 'delivery',
      subtotal: 10000,
      lat: -34.605,
      lng: -58.395,
    });

    expect(quote.available).toBe(true);
    expect(quote.matchedBy).toBe('coordinates');
    expect(quote.zone?.id).toBe('zone-palermo');
    expect(quote.deliveryFee).toBe(1200);
  });
});
