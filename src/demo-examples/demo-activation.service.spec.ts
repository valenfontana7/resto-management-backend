import { NotFoundException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { DemoActivationService } from './demo-activation.service';

const DEMO_SLUG = 'arena-cafe-demo';
const LEAD_ID = 'lead-arena-1';
const RESTAURANT_ID = 'rest-new-1';
const USER_ID = 'user-owner-1';

function buildDemoRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demo-1',
    slug: DEMO_SLUG,
    name: 'Arena Café',
    type: 'cafe',
    cuisine: ['cafe', 'brunch'],
    city: 'CABA',
    neighborhood: 'Palermo',
    isPublic: false,
    leadId: LEAD_ID,
    isActive: true,
    payload: {
      description: 'Café de especialidad en Palermo',
      contact: {
        email: 'hola@arenacafe.test',
        phone: '+54 11 5555-0000',
      },
      location: {
        address: 'Honduras 4500',
        city: 'CABA',
      },
      hours: {
        monday: '08:00-18:00',
        sunday: 'Cerrado',
      },
      branding: {
        assets: {
          logo: 'leads-demos/arena-cafe/logo.webp',
          coverImage: 'leads-demos/arena-cafe/hero.webp',
        },
        theme: { primary: '#0f766e' },
        layout: { menuStyle: 'grid' },
        sections: {
          featured: {
            dishIds: ['dish-latte', 'dish-missing'],
          },
        },
      },
      menu: [
        {
          id: 'cat-cafes',
          name: 'Cafés',
          description: 'Espresso bar',
          order: 1,
          dishes: [
            {
              id: 'dish-latte',
              name: 'Latte',
              description: 'Con leche texturizada',
              price: 4200,
              image: 'leads-demos/arena-cafe/latte.webp',
              isFeatured: true,
            },
            {
              id: 'dish-americano',
              name: 'Americano',
              price: 3500,
            },
          ],
        },
        {
          id: 'cat-pasteles',
          name: 'Pasteles',
          dishes: [
            {
              id: 'dish-medialuna',
              name: 'Medialuna',
              price: 1800,
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

describe('DemoActivationService', () => {
  let service: DemoActivationService;
  let prisma: {
    $transaction: jest.Mock;
    category: { create: jest.Mock };
    dish: { create: jest.Mock };
    restaurant: { update: jest.Mock };
    lead: { findUnique: jest.Mock; update: jest.Mock };
  };
  let demoExamplesService: { findBySlug: jest.Mock };
  let builderService: {
    replaceConfig: jest.Mock;
    publishConfig: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<void>) =>
        fn(prisma),
      ),
      category: { create: jest.fn() },
      dish: { create: jest.fn() },
      restaurant: { update: jest.fn() },
      lead: { findUnique: jest.fn(), update: jest.fn() },
    };
    demoExamplesService = { findBySlug: jest.fn() };
    builderService = {
      replaceConfig: jest.fn().mockResolvedValue(undefined),
      publishConfig: jest.fn().mockResolvedValue(undefined),
    };

    service = new DemoActivationService(
      prisma as any,
      demoExamplesService as any,
      builderService as any,
    );
  });

  describe('buildOnboardingSeed', () => {
    it('builds seed with demo metadata, hours, categories and suggested slug', async () => {
      demoExamplesService.findBySlug.mockResolvedValue(buildDemoRecord());

      const seed = await service.buildOnboardingSeed(DEMO_SLUG);

      expect(seed.demoExampleSlug).toBe(DEMO_SLUG);
      expect(seed.leadId).toBe(LEAD_ID);
      expect(seed.restaurantName).toBe('Arena Café');
      expect(seed.suggestedSlug).not.toBe(DEMO_SLUG);
      expect(seed.suggestedSlug.startsWith('arena-cafe-')).toBe(true);

      expect(seed.onboardingData.businessInfo).toMatchObject({
        restaurantName: 'Arena Café',
        businessType: 'cafe',
        cuisine: ['cafe', 'brunch'],
        description: 'Café de especialidad en Palermo',
      });
      expect(seed.onboardingData.contact).toMatchObject({
        email: 'hola@arenacafe.test',
        phone: '+54 11 5555-0000',
        address: 'Honduras 4500',
        city: 'CABA',
        country: 'Argentina',
      });
      expect((seed.onboardingData.hours as any).monday.isOpen).toBe(true);
      expect((seed.onboardingData.hours as any).sunday.isOpen).toBe(false);
      expect((seed.onboardingData.menuSetup as any).categories).toHaveLength(2);
      expect((seed.onboardingData.menuSetup as any).estimatedDishes).toBe(3);
      expect(seed.onboardingData.demoActivation).toEqual({
        demoExampleSlug: DEMO_SLUG,
        leadId: LEAD_ID,
        restaurantName: 'Arena Café',
      });
      expect((seed.onboardingData.aiDraft as any).builderDraft.theme).toEqual({
        primary: '#0f766e',
      });
    });

    it('falls back leadId from payload when record.leadId is null', async () => {
      demoExamplesService.findBySlug.mockResolvedValue(
        buildDemoRecord({
          leadId: null,
          payload: {
            ...buildDemoRecord().payload,
            leadId: 'lead-from-payload',
          },
        }),
      );

      const seed = await service.buildOnboardingSeed(DEMO_SLUG);
      expect(seed.leadId).toBe('lead-from-payload');
    });
  });

  describe('materializeFromDemoExample', () => {
    it('rejects empty slug', async () => {
      await expect(
        service.materializeFromDemoExample(RESTAURANT_ID, '   '),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('clones menu, assets, builder and converts lead to CLIENT', async () => {
      demoExamplesService.findBySlug.mockResolvedValue(buildDemoRecord());

      const createdCategories = [{ id: 'cat-real-1' }, { id: 'cat-real-2' }];
      const createdDishes = [
        { id: 'dish-real-latte' },
        { id: 'dish-real-americano' },
        { id: 'dish-real-medialuna' },
      ];

      prisma.category.create
        .mockResolvedValueOnce(createdCategories[0])
        .mockResolvedValueOnce(createdCategories[1]);
      prisma.dish.create
        .mockResolvedValueOnce(createdDishes[0])
        .mockResolvedValueOnce(createdDishes[1])
        .mockResolvedValueOnce(createdDishes[2]);

      prisma.lead.findUnique.mockResolvedValue({
        id: LEAD_ID,
        status: LeadStatus.INTERESTED,
      });
      prisma.lead.update.mockResolvedValue({});

      const result = await service.materializeFromDemoExample(
        RESTAURANT_ID,
        DEMO_SLUG,
        USER_ID,
      );

      expect(result).toEqual({ leadId: LEAD_ID });
      expect(prisma.category.create).toHaveBeenCalledTimes(2);
      expect(prisma.dish.create).toHaveBeenCalledTimes(3);
      expect(prisma.dish.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Latte',
            price: 4200,
            isFeatured: true,
            restaurantId: RESTAURANT_ID,
            categoryId: 'cat-real-1',
          }),
        }),
      );
      expect(prisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: RESTAURANT_ID },
        data: {
          logo: 'leads-demos/arena-cafe/logo.webp',
          coverImage: 'leads-demos/arena-cafe/hero.webp',
        },
      });

      expect(builderService.replaceConfig).toHaveBeenCalledWith(
        RESTAURANT_ID,
        expect.objectContaining({
          theme: { primary: '#0f766e' },
          sections: {
            featured: {
              dishIds: ['dish-real-latte', 'dish-missing'],
            },
          },
        }),
        USER_ID,
      );
      expect(builderService.publishConfig).toHaveBeenCalledWith(RESTAURANT_ID);

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: LEAD_ID },
        data: {
          status: LeadStatus.CLIENT,
          convertedRestaurantId: RESTAURANT_ID,
          statusHistory: {
            create: {
              fromStatus: LeadStatus.INTERESTED,
              toStatus: LeadStatus.CLIENT,
              changedById: USER_ID,
            },
          },
        },
      });
    });

    it('only links restaurant when lead is already CLIENT', async () => {
      demoExamplesService.findBySlug.mockResolvedValue(buildDemoRecord());
      prisma.category.create.mockResolvedValue({ id: 'c1' });
      prisma.dish.create.mockResolvedValue({ id: 'd1' });
      prisma.lead.findUnique.mockResolvedValue({
        id: LEAD_ID,
        status: LeadStatus.CLIENT,
      });
      prisma.lead.update.mockResolvedValue({});

      await service.materializeFromDemoExample(
        RESTAURANT_ID,
        ` ${DEMO_SLUG.toUpperCase()} `,
        USER_ID,
      );

      expect(demoExamplesService.findBySlug).toHaveBeenCalledWith(DEMO_SLUG);
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: LEAD_ID },
        data: { convertedRestaurantId: RESTAURANT_ID },
      });
    });

    it('skips lead update when lead was deleted', async () => {
      demoExamplesService.findBySlug.mockResolvedValue(buildDemoRecord());
      prisma.category.create.mockResolvedValue({ id: 'c1' });
      prisma.dish.create.mockResolvedValue({ id: 'd1' });
      prisma.lead.findUnique.mockResolvedValue(null);

      await service.materializeFromDemoExample(
        RESTAURANT_ID,
        DEMO_SLUG,
        USER_ID,
      );

      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(builderService.publishConfig).toHaveBeenCalled();
    });
  });
});
