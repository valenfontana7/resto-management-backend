import { Injectable } from '@nestjs/common';
import { SimulationRunStatus } from '@prisma/client';
import { AuthService } from '../../auth/auth.service';
import { RolesCatalogService } from '../../common/services/roles-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_LAB_PROFILE,
  type LabProfile,
  resolveLabProfile,
} from './lab-profile.types';
import { seedOpsCoreFloor } from './ops-core-seed';

export interface SimulationBootstrapInput {
  scenarioId: string;
  scenarioVersion: string;
  repetitionKey: string;
  seedState: string;
  simulatedStartAt: Date;
  labProfile?: LabProfile;
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
  labProfile: LabProfile;
  managerUserId: string;
  kitchenUserId: string;
  waiterUserId: string | null;
  ownerUserId: string;
  managerToken: string;
  kitchenToken: string;
  waiterToken: string | null;
  ownerToken: string;
  inventoryItemId: string;
  deliveryZoneId: string | null;
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
    const labProfile = resolveLabProfile(
      input.labProfile ?? DEFAULT_LAB_PROFILE,
    );
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
              salon: labProfile === 'ops-core',
              tables: labProfile === 'ops-core',
              onlineOrdering: true,
              takeaway: true,
              delivery: labProfile === 'ops-core',
              reservations: labProfile === 'ops-core',
              loyalty: labProfile === 'ops-core',
              reviews: labProfile === 'ops-core',
            },
            businessRules: {
              payment: { methods: ['cash', 'digital-wallet'] },
              fiscal: {
                cuit: '20111111112',
                razonSocial: 'Pizzeria Lab SA',
                puntoVenta: 1,
                defaultDocumentType: 'FACTURA_B',
                issuerIvaCondition: 'RESPONSABLE_INSCRIPTO',
                environment: 'testing',
              },
              delivery: { enabled: labProfile === 'ops-core' },
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
            isAvailableInSalon: labProfile === 'ops-core',
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
            isAvailableInSalon: labProfile === 'ops-core',
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

        const roleNames =
          labProfile === 'ops-core'
            ? (['OWNER', 'MANAGER', 'KITCHEN', 'WAITER'] as const)
            : (['OWNER', 'MANAGER', 'KITCHEN'] as const);
        const roles = await tx.role.findMany({
          where: {
            restaurantId: restaurant.id,
            name: { in: [...roleNames] },
          },
          select: { id: true, name: true },
        });
        const ownerRole = roles.find((role) => role.name === 'OWNER');
        const managerRole = roles.find((role) => role.name === 'MANAGER');
        const kitchenRole = roles.find((role) => role.name === 'KITCHEN');
        const waiterRole = roles.find((role) => role.name === 'WAITER');
        if (!ownerRole || !managerRole || !kitchenRole) {
          throw new Error(
            'Bentoo Lab no pudo crear roles OWNER, MANAGER y KITCHEN',
          );
        }
        if (labProfile === 'ops-core' && !waiterRole) {
          throw new Error('Bentoo Lab no pudo crear rol WAITER');
        }

        const owner = await tx.user.create({
          data: {
            restaurantId: restaurant.id,
            roleId: ownerRole.id,
            email: `owner-${suffix}@lab.bentoo.invalid`,
            name: 'Owner Bentoo Lab',
            isActive: true,
            emailVerifiedAt: input.simulatedStartAt,
          },
        });
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

        let waiter: { id: string; name: string } | null = null;
        if (waiterRole) {
          waiter = await tx.user.create({
            data: {
              restaurantId: restaurant.id,
              roleId: waiterRole.id,
              email: `mozo-${suffix}@lab.bentoo.invalid`,
              name: 'Mozo Bentoo Lab',
              isActive: true,
              emailVerifiedAt: input.simulatedStartAt,
            },
          });
        }

        const memberships = [
          {
            userId: owner.id,
            restaurantId: restaurant.id,
            roleId: ownerRole.id,
            isDefault: true,
          },
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
        ];
        if (waiter && waiterRole) {
          memberships.push({
            userId: waiter.id,
            restaurantId: restaurant.id,
            roleId: waiterRole.id,
            isDefault: true,
          });
        }
        await tx.restaurantMembership.createMany({ data: memberships });

        let deliveryZoneId: string | null = null;
        if (labProfile === 'ops-core' && waiter) {
          const seeded = await seedOpsCoreFloor(tx, {
            restaurantId: restaurant.id,
            managerUserId: manager.id,
            managerName: manager.name,
            waiterUserId: waiter.id,
            waiterName: waiter.name,
            mozzarellaDishId: mozzarella.id,
            fugazzetaDishId: fugazzeta.id,
            mozzarellaPrice: 8000,
            fugazzetaPrice: 9500,
            simulatedStartAt: input.simulatedStartAt,
          });
          deliveryZoneId = seeded.deliveryZoneId;
        }

        await tx.simulationRun.update({
          where: { id: run.id },
          data: {
            restaurantId: restaurant.id,
            status: SimulationRunStatus.CREATED,
          },
        });

        return {
          restaurant,
          owner,
          manager,
          kitchen,
          waiter,
          inventoryItem,
          deliveryZoneId,
        };
      });

      const authJobs: Array<Promise<{ token: string }>> = [
        this.auth.createAuthResponseForUserId(bootstrapped.owner.id),
        this.auth.createAuthResponseForUserId(bootstrapped.manager.id),
        this.auth.createAuthResponseForUserId(bootstrapped.kitchen.id),
      ];
      if (bootstrapped.waiter) {
        authJobs.push(
          this.auth.createAuthResponseForUserId(bootstrapped.waiter.id),
        );
      }
      const authResults = await Promise.all(authJobs);
      const ownerAuth = authResults[0];
      const managerAuth = authResults[1];
      const kitchenAuth = authResults[2];
      const waiterAuth = bootstrapped.waiter ? authResults[3] : null;

      return {
        run,
        restaurant: bootstrapped.restaurant,
        labProfile,
        managerUserId: bootstrapped.manager.id,
        kitchenUserId: bootstrapped.kitchen.id,
        waiterUserId: bootstrapped.waiter?.id ?? null,
        ownerUserId: bootstrapped.owner.id,
        managerToken: managerAuth.token,
        kitchenToken: kitchenAuth.token,
        waiterToken: waiterAuth?.token ?? null,
        ownerToken: ownerAuth.token,
        inventoryItemId: bootstrapped.inventoryItem.id,
        deliveryZoneId: bootstrapped.deliveryZoneId,
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
