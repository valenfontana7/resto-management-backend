import { Injectable } from '@nestjs/common';
import { SimulationRunStatus } from '@prisma/client';
import { AuthService } from '../../auth/auth.service';
import { RolesCatalogService } from '../../common/services/roles-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface SimulationBootstrapInput {
  scenarioId: string;
  scenarioVersion: string;
  repetitionKey: string;
  seedState: string;
  simulatedStartAt: Date;
}

export interface SimulationBootstrapResult {
  run: {
    id: string;
    scenarioId: string;
    scenarioVersion: string;
  };
  restaurant: {
    id: string;
    slug: string;
  };
  managerUserId: string;
  kitchenUserId: string;
  managerToken: string;
  kitchenToken: string;
  inventoryItemId: string;
}

@Injectable()
export class SimulationBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesCatalog: RolesCatalogService,
    private readonly auth: AuthService,
  ) {}

  async bootstrap(
    input: SimulationBootstrapInput,
  ): Promise<SimulationBootstrapResult> {
    const run = await this.prisma.simulationRun.create({
      data: {
        scenarioId: input.scenarioId,
        scenarioVersion: input.scenarioVersion,
        repetitionKey: input.repetitionKey,
        seedState: input.seedState,
        status: SimulationRunStatus.CREATED,
        simulatedStartAt: input.simulatedStartAt,
        simulatedNow: input.simulatedStartAt,
        visualSpeed: 20,
        runtimeState: {},
        invariantResults: {},
      },
    });

    await this.prisma.simulationRun.update({
      where: { id: run.id },
      data: { status: SimulationRunStatus.BOOTSTRAPPING },
    });

    try {
      const bootstrapped = await this.prisma.$transaction(async (tx) => {
        const suffix = run.id
          .slice(-8)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        const slug = `lab-pizzeria-${suffix}`;
        const restaurant = await tx.restaurant.create({
          data: {
            slug,
            name: 'Pizzería Bentoo Lab',
            type: 'pizzeria',
            cuisineTypes: ['pizza'],
            description: 'Tenant aislado de Bentoo Lab',
            email: `restaurante-${suffix}@lab.bentoo.invalid`,
            phone: '0000000000',
            address: 'Dirección simulada 100',
            city: 'Buenos Aires',
            country: 'Argentina',
            isPublished: true,
            isIndexable: false,
            onboardingIncomplete: false,
            ownerWhatsappEnabled: false,
            features: {
              menu: true,
              orders: true,
              kitchen: true,
            },
            businessRules: {
              payment: { methods: ['cash'] },
              inventory: { autoDeductOnSale: true },
              notifications: {
                email: false,
                push: false,
                whatsapp: false,
              },
            },
          },
        });

        await this.rolesCatalog.ensureSystemRoles(restaurant.id, tx);
        const category = await tx.category.create({
          data: {
            restaurantId: restaurant.id,
            name: 'Pizzas',
            order: 0,
            isActive: true,
          },
        });
        const mozzarella = await tx.dish.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: category.id,
            name: 'Pizza muzzarella',
            description: 'Pizza clásica de Bentoo Lab',
            price: 8000,
            preparationTime: 12,
            isAvailable: true,
            isAvailableInSalon: false,
          },
        });
        const fugazzeta = await tx.dish.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: category.id,
            name: 'Fugazzeta',
            description: 'Pizza de cebolla y queso de Bentoo Lab',
            price: 9500,
            preparationTime: 15,
            isAvailable: true,
            isAvailableInSalon: false,
          },
        });

        const inventoryItem = await tx.inventoryItem.create({
          data: {
            restaurantId: restaurant.id,
            name: 'Masa',
            unit: 'unidad',
            currentStock: 20,
            minStock: 2,
            linkedDishIds: [mozzarella.id, fugazzeta.id],
            autoDisableDishes: true,
            unitCost: 100,
            notes: 'Insumo mínimo de Bentoo Lab Fase 2',
          },
        });

        await tx.dishRecipeLine.createMany({
          data: [
            {
              dishId: mozzarella.id,
              inventoryItemId: inventoryItem.id,
              quantity: 1,
            },
            {
              dishId: fugazzeta.id,
              inventoryItemId: inventoryItem.id,
              quantity: 1,
            },
          ],
        });

        const roles = await tx.role.findMany({
          where: {
            restaurantId: restaurant.id,
            name: { in: ['MANAGER', 'KITCHEN'] },
          },
          select: { id: true, name: true },
        });
        const managerRole = roles.find((role) => role.name === 'MANAGER');
        const kitchenRole = roles.find((role) => role.name === 'KITCHEN');
        if (!managerRole || !kitchenRole) {
          throw new Error('Bentoo Lab no pudo crear roles MANAGER y KITCHEN');
        }

        const manager = await tx.user.create({
          data: {
            restaurantId: restaurant.id,
            roleId: managerRole.id,
            email: `manager-${suffix}@lab.bentoo.invalid`,
            name: 'Encargado Bentoo Lab',
            isActive: true,
            emailVerifiedAt: input.simulatedStartAt,
          },
        });
        const kitchen = await tx.user.create({
          data: {
            restaurantId: restaurant.id,
            roleId: kitchenRole.id,
            email: `cocina-${suffix}@lab.bentoo.invalid`,
            name: 'Cocina Bentoo Lab',
            isActive: true,
            emailVerifiedAt: input.simulatedStartAt,
          },
        });
        await tx.restaurantMembership.createMany({
          data: [
            {
              userId: manager.id,
              restaurantId: restaurant.id,
              roleId: managerRole.id,
              isDefault: true,
            },
            {
              userId: kitchen.id,
              restaurantId: restaurant.id,
              roleId: kitchenRole.id,
              isDefault: true,
            },
          ],
        });
        await tx.simulationRun.update({
          where: { id: run.id },
          data: {
            restaurantId: restaurant.id,
            status: SimulationRunStatus.CREATED,
          },
        });

        return { restaurant, manager, kitchen, inventoryItem };
      });

      const [managerAuth, kitchenAuth] = await Promise.all([
        this.auth.createAuthResponseForUserId(bootstrapped.manager.id),
        this.auth.createAuthResponseForUserId(bootstrapped.kitchen.id),
      ]);

      return {
        run,
        restaurant: bootstrapped.restaurant,
        managerUserId: bootstrapped.manager.id,
        kitchenUserId: bootstrapped.kitchen.id,
        managerToken: managerAuth.token,
        kitchenToken: kitchenAuth.token,
        inventoryItemId: bootstrapped.inventoryItem.id,
      };
    } catch (error) {
      await this.prisma.simulationRun.update({
        where: { id: run.id },
        data: {
          status: SimulationRunStatus.FAILED,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
}
