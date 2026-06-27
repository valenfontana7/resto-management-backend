import { pullMenuStream, pullTablesStream } from './edge-sync-pull.util';

describe('edge-sync-pull.util', () => {
  it('pullTablesStream retorna áreas con cursor ISO', async () => {
    const updatedAt = new Date('2026-06-01T12:00:00.000Z');
    const prisma = {
      tableArea: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'area-1',
            name: 'Salón',
            order: 0,
            updatedAt,
            tables: [
              {
                id: 't-1',
                number: '1',
                capacity: 4,
                shape: 'SQUARE',
                status: 'AVAILABLE',
                areaId: 'area-1',
                position: null,
                updatedAt,
              },
            ],
          },
        ]),
      },
    } as unknown as Parameters<typeof pullTablesStream>[0];

    const result = await pullTablesStream(prisma, 'rest-1');
    expect(result.items).toHaveLength(1);
    expect(result.cursor).toBe(updatedAt.toISOString());
  });

  it('pullMenuStream retorna categorías', async () => {
    const updatedAt = new Date('2026-06-02T10:00:00.000Z');
    const prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cat-1',
            name: 'Principales',
            order: 0,
            updatedAt,
            dishes: [],
          },
        ]),
      },
    } as unknown as Parameters<typeof pullMenuStream>[0];

    const result = await pullMenuStream(prisma, 'rest-1');
    expect(result.items[0].name).toBe('Principales');
  });
});
