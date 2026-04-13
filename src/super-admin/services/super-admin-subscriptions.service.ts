import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { PlanType } from '@prisma/client';

@Injectable()
export class SuperAdminSubscriptionsService {
  private readonly logger = new Logger(SuperAdminSubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async updateSubscription(
    restaurantId: string,
    dto: UpdateSubscriptionDto,
    adminId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    if (!restaurant.subscription) {
      throw new BadRequestException('Restaurant has no subscription');
    }

    const updated = await this.prisma.subscription.update({
      where: { id: restaurant.subscription.id },
      data: dto as any,
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'UPDATE_SUBSCRIPTION',
        targetRestaurantId: restaurantId,
        details: { changes: dto as any },
      },
    });

    return updated;
  }

  async changePlan(restaurantId: string, planId: string, adminId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    if (!restaurant.subscription) {
      throw new BadRequestException(
        'El restaurante no tiene una suscripción activa',
      );
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    if (!plan.isActive) {
      throw new BadRequestException('El plan seleccionado no está activo');
    }

    const oldPlanId = restaurant.subscription.planId;
    const oldPlanType = restaurant.subscription.planType;

    const newPlanType = plan.id as PlanType;

    const subscription = await this.prisma.subscription.update({
      where: { id: restaurant.subscription.id },
      data: {
        planId: plan.id,
        planType: newPlanType,
        previousPlanType: oldPlanType,
      },
      include: {
        plan: true,
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'CHANGE_SUBSCRIPTION_PLAN',
        targetRestaurantId: restaurantId,
        details: {
          subscriptionId: subscription.id,
          oldPlanId,
          oldPlanType,
          newPlanId: plan.id,
          newPlanType: subscription.planType,
        },
      },
    });

    return {
      success: true,
      message: 'Plan actualizado correctamente',
      subscription: {
        id: subscription.id,
        restaurantId: subscription.restaurantId,
        planType: subscription.planType,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    };
  }

  async cancelSubscription(
    restaurantId: string,
    reason?: string,
    adminId?: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    if (!restaurant.subscription) {
      throw new BadRequestException(
        'El restaurante no tiene una suscripción activa',
      );
    }

    if (restaurant.subscription.status === 'CANCELED') {
      throw new BadRequestException('La suscripción ya está cancelada');
    }

    const subscription = await this.prisma.subscription.update({
      where: { id: restaurant.subscription.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        cancellationReason: reason,
        cancelAtPeriodEnd: true,
      },
    });

    if (adminId) {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'CANCEL_SUBSCRIPTION',
          targetRestaurantId: restaurantId,
          details: {
            subscriptionId: subscription.id,
            reason: reason || 'No especificado',
            canceledAt: subscription.canceledAt,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
        },
      });
    }

    return {
      success: true,
      message:
        'Suscripción cancelada. Acceso válido hasta el fin del período actual.',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        canceledAt: subscription.canceledAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancellationReason: subscription.cancellationReason,
      },
    };
  }

  async reactivateSubscription(
    restaurantId: string,
    planId?: string,
    adminId?: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    if (!restaurant.subscription) {
      throw new BadRequestException('El restaurante no tiene una suscripción');
    }

    if (
      restaurant.subscription.status !== 'CANCELED' &&
      restaurant.subscription.status !== 'EXPIRED'
    ) {
      throw new BadRequestException(
        'La suscripción debe estar cancelada o expirada para ser reactivada',
      );
    }

    let plan;
    if (planId) {
      plan = await this.prisma.subscriptionPlan.findUnique({
        where: { id: planId },
      });

      if (!plan) {
        throw new NotFoundException('Plan no encontrado');
      }

      if (!plan.isActive) {
        throw new BadRequestException('El plan seleccionado no está activo');
      }
    } else {
      plan = await this.prisma.subscriptionPlan.findUnique({
        where: { id: restaurant.subscription.planId },
      });
    }

    const now = new Date();
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const newPlanType = plan.id as PlanType;

    const subscription = await this.prisma.subscription.update({
      where: { id: restaurant.subscription.id },
      data: {
        status: 'ACTIVE',
        planId: plan.id,
        planType: newPlanType,
        canceledAt: null,
        cancellationReason: null,
        cancelAtPeriodEnd: false,
        currentPeriodStart: now,
        currentPeriodEnd: currentPeriodEnd,
      },
    });

    if (adminId) {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'REACTIVATE_SUBSCRIPTION',
          targetRestaurantId: restaurantId,
          details: {
            subscriptionId: subscription.id,
            planId: plan.id,
            planType: subscription.planType,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
        },
      });
    }

    return {
      success: true,
      message: 'Suscripción reactivada correctamente',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planType: subscription.planType,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    };
  }

  async toggleTrial(
    restaurantId: string,
    enableTrial: boolean,
    adminId?: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    if (!restaurant.subscription) {
      throw new BadRequestException('El restaurante no tiene una suscripción');
    }

    const now = new Date();
    let updateData: any = {};

    if (enableTrial) {
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 30);

      updateData = {
        status: 'TRIALING',
        trialStart: now,
        trialEnd: trialEnd,
        canceledAt: null,
        cancellationReason: null,
        cancelAtPeriodEnd: false,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
      };
    } else {
      updateData = {
        status: 'ACTIVE',
        trialStart: null,
        trialEnd: null,
        canceledAt: null,
        cancellationReason: null,
        cancelAtPeriodEnd: false,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      };
    }

    const subscription = await this.prisma.subscription.update({
      where: { id: restaurant.subscription.id },
      data: updateData,
    });

    if (adminId) {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: enableTrial ? 'ENABLE_TRIAL' : 'DISABLE_TRIAL',
          targetRestaurantId: restaurantId,
          details: {
            subscriptionId: subscription.id,
            status: subscription.status,
            trialStart: subscription.trialStart,
            trialEnd: subscription.trialEnd,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
        },
      });
    }

    return {
      success: true,
      message: enableTrial
        ? 'Trial activado correctamente'
        : 'Trial desactivado correctamente',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    };
  }

  async updateBillingControls(
    restaurantId: string,
    dto: any,
    adminId?: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    if (!restaurant.subscription) {
      throw new BadRequestException('El restaurante no tiene una suscripción');
    }

    const now = new Date();
    const updateData: any = {};

    if (dto.isFreeAccount !== undefined) {
      updateData.isFreeAccount = dto.isFreeAccount;
    }

    if (dto.discountPercentage !== undefined) {
      updateData.discountPercentage = dto.discountPercentage;
      updateData.discountGrantedAt = now;
      if (adminId) {
        updateData.discountGrantedBy = adminId;
      }
    }

    if (dto.discountReason !== undefined) {
      updateData.discountReason = dto.discountReason;
    }

    const subscription = await this.prisma.subscription.update({
      where: { id: restaurant.subscription.id },
      data: updateData,
    });

    if (adminId) {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'UPDATE_BILLING_CONTROLS',
          targetRestaurantId: restaurantId,
          details: {
            subscriptionId: subscription.id,
            isFreeAccount: subscription.isFreeAccount,
            discountPercentage: subscription.discountPercentage,
            discountReason: subscription.discountReason,
            discountGrantedBy: subscription.discountGrantedBy,
            discountGrantedAt: subscription.discountGrantedAt,
          },
        },
      });
    }

    return {
      success: true,
      message: 'Controles de facturación actualizados correctamente',
      subscription: {
        id: subscription.id,
        isFreeAccount: subscription.isFreeAccount,
        discountPercentage: subscription.discountPercentage,
        discountReason: subscription.discountReason,
        discountGrantedBy: subscription.discountGrantedBy,
        discountGrantedAt: subscription.discountGrantedAt,
      },
    };
  }
}
