import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateRestrictionDto } from './dto/create-restriction.dto';
import { UpdateRestrictionDto } from './dto/update-restriction.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // PLANS CRUD
  // ============================================

  /**
   * Obtener todos los planes
   */
  async findAll() {
    return this.prisma.subscriptionPlan.findMany({
      include: {
        restrictions: {
          orderBy: {
            category: 'asc',
          },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });
  }

  /**
   * Obtener planes activos (para usuarios)
   */
  async findActive() {
    return this.prisma.subscriptionPlan.findMany({
      where: {
        isActive: true,
      },
      include: {
        restrictions: {
          orderBy: {
            category: 'asc',
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });
  }

  /**
   * Obtener un plan por ID
   */
  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        restrictions: {
          orderBy: {
            category: 'asc',
          },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Plan con ID ${id} no encontrado`);
    }

    return plan;
  }

  /**
   * Crear un plan
   */
  async create(createPlanDto: CreatePlanDto) {
    // Verificar que el ID no exista
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id: createPlanDto.id },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un plan con ID ${createPlanDto.id}`,
      );
    }

    const { restrictions, ...planData } = createPlanDto;

    return this.prisma.subscriptionPlan.create({
      data: {
        ...planData,
        restrictions: restrictions
          ? {
              create: restrictions,
            }
          : undefined,
      },
      include: {
        restrictions: true,
      },
    });
  }

  /**
   * Actualizar un plan
   */
  async update(id: string, updatePlanDto: UpdatePlanDto) {
    await this.findOne(id); // Verificar que existe

    const { restrictions, ...planData } = updatePlanDto;

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: planData,
      include: {
        restrictions: true,
      },
    });
  }

  /**
   * Eliminar un plan
   */
  async remove(id: string) {
    const plan = await this.findOne(id);

    // Verificar que no tenga suscripciones activas
    const activeSubscriptions = await this.prisma.subscription.count({
      where: {
        planId: id,
        status: {
          in: ['ACTIVE', 'TRIALING'],
        },
      },
    });

    if (activeSubscriptions > 0) {
      throw new ConflictException(
        `No se puede eliminar el plan ${plan.displayName} porque tiene ${activeSubscriptions} suscripciones activas`,
      );
    }

    return this.prisma.subscriptionPlan.delete({
      where: { id },
    });
  }

  // ============================================
  // RESTRICTIONS CRUD
  // ============================================

  /**
   * Obtener todas las restricciones de un plan
   */
  async findRestrictions(planId: string) {
    await this.findOne(planId); // Verificar que el plan existe

    return this.prisma.planRestriction.findMany({
      where: { planId },
      orderBy: {
        category: 'asc',
      },
    });
  }

  /**
   * Obtener una restricción específica
   */
  async findRestriction(planId: string, restrictionId: string) {
    const restriction = await this.prisma.planRestriction.findFirst({
      where: {
        id: restrictionId,
        planId,
      },
    });

    if (!restriction) {
      throw new NotFoundException(
        `Restricción con ID ${restrictionId} no encontrada`,
      );
    }

    return restriction;
  }

  /**
   * Crear una restricción para un plan
   */
  async createRestriction(
    planId: string,
    createRestrictionDto: CreateRestrictionDto,
  ) {
    await this.findOne(planId); // Verificar que el plan existe

    // Verificar que no exista una restricción con la misma key
    const existing = await this.prisma.planRestriction.findFirst({
      where: {
        planId,
        key: createRestrictionDto.key,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una restricción con key ${createRestrictionDto.key} para este plan`,
      );
    }

    return this.prisma.planRestriction.create({
      data: {
        ...createRestrictionDto,
        planId,
      },
    });
  }

  /**
   * Actualizar una restricción
   */
  async updateRestriction(
    planId: string,
    restrictionId: string,
    updateRestrictionDto: UpdateRestrictionDto,
  ) {
    await this.findRestriction(planId, restrictionId); // Verificar que existe

    return this.prisma.planRestriction.update({
      where: { id: restrictionId },
      data: updateRestrictionDto,
    });
  }

  /**
   * Eliminar una restricción
   */
  async removeRestriction(planId: string, restrictionId: string) {
    await this.findRestriction(planId, restrictionId); // Verificar que existe

    return this.prisma.planRestriction.delete({
      where: { id: restrictionId },
    });
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Obtener restricciones agrupadas por categoría
   */
  async getRestrictionsByCategory(planId: string) {
    const restrictions = await this.findRestrictions(planId);

    const grouped = restrictions.reduce((acc, restriction) => {
      if (!acc[restriction.category]) {
        acc[restriction.category] = [];
      }
      acc[restriction.category].push(restriction);
      return acc;
    }, {});

    return grouped;
  }

  /**
   * Verificar si un plan tiene una característica específica
   */
  async hasFeature(planId: string, featureKey: string): Promise<boolean> {
    const restriction = await this.prisma.planRestriction.findFirst({
      where: {
        planId,
        key: featureKey,
        type: 'boolean',
      },
    });

    return restriction ? restriction.value === 'true' : false;
  }

  /**
   * Obtener el límite de una restricción
   */
  async getLimit(planId: string, limitKey: string): Promise<number> {
    const restriction = await this.prisma.planRestriction.findFirst({
      where: {
        planId,
        key: limitKey,
        type: 'limit',
      },
    });

    return restriction ? parseInt(restriction.value, 10) : 0;
  }
}
