import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { PlanType } from '@prisma/client';
import { addMonths } from 'date-fns';
import { AdminAlertsService } from '../../admin-alerts/admin-alerts.service';
import { SubscriptionResolverService } from '../../subscriptions/subscription-resolver.service';

@Injectable()
export class SuperAdminSubscriptionsService {
  private readonly logger = new Logger(SuperAdminSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionResolver: SubscriptionResolverService,
    @Optional() private readonly adminAlerts?: AdminAlertsService,
  ) {}

  private async resolveRestaurantBilling(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    const subscription =
      await this.subscriptionResolver.resolveForRestaurant(restaurantId);
    if (!subscription) {
      throw new BadRequestException(
        'Este restaurante no tiene suscripción activa en la cuenta del dueño',
      );
    }
    return { restaurant, subscription };
  }

  async updateSubscription(
    restaurantId: string,
    dto: UpdateSubscriptionDto,
    adminId: string,
  ) {
    const { restaurant, subscription } =
      await this.resolveRestaurantBilling(restaurantId);

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
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

    void this.adminAlerts?.notifyAdminEvent({
      source: 'super-admin.update-subscription',
      event: 'SUBSCRIPTION_UPDATED',
      subject: '💳 Suscripción actualizada',
      title: 'Cambio en suscripción',
      message: `Se actualizaron parámetros de suscripción en ${restaurant.name}.`,
      data: {
        restaurantId,
        restaurantName: restaurant.name,
        subscriptionId: updated.id,
        previousStatus: subscription.status,
        newStatus: updated.status,
        previousPlanType: subscription.planType,
        newPlanType: updated.planType,
        changes: dto as any,
      },
    });

    return updated;
  }

  async changePlan(restaurantId: string, planId: string, adminId: string) {
    const { restaurant, subscription: currentSubscription } =
      await this.resolveRestaurantBilling(restaurantId);

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    if (!plan.isActive) {
      throw new BadRequestException('El plan seleccionado no está activo');
    }

    const oldPlanId = currentSubscription.planId;
    const oldPlanType = currentSubscription.planType;

    const newPlanType = plan.id as PlanType;
    const now = new Date();
    const isPaidPlan = plan.price > 0;

    const subscription = await this.prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        planId: plan.id,
        planType: newPlanType,
        previousPlanType: oldPlanType,
        status: 'ACTIVE',
        isFreeAccount: !isPaidPlan,
        currentPeriodStart: now,
        currentPeriodEnd: isPaidPlan ? addMonths(now, 1) : addMonths(now, 120),
        trialStart: null,
        trialEnd: null,
        nextPaymentDate: isPaidPlan ? addMonths(now, 1) : null,
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

    void this.adminAlerts?.notifyAdminEvent({
      source: 'super-admin.change-plan',
      event: 'SUBSCRIPTION_PLAN_CHANGED',
      subject: '📦 Plan de suscripción cambiado',
      title: 'Cambio de plan',
      message: `El restaurante ${restaurant.name} cambió del plan ${oldPlanType} al plan ${subscription.planType}.`,
      data: {
        restaurantId,
        restaurantName: restaurant.name,
        subscriptionId: subscription.id,
        oldPlanId,
        oldPlanType,
        newPlanId: plan.id,
        newPlanType: subscription.planType,
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
    const { restaurant, subscription: currentSubscription } =
      await this.resolveRestaurantBilling(restaurantId);

    if (currentSubscription.status === 'CANCELED') {
      throw new BadRequestException('La suscripción ya está cancelada');
    }

    const subscription = await this.prisma.subscription.update({
      where: { id: currentSubscription.id },
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

    void this.adminAlerts?.notifyAdminEvent({
      source: 'super-admin.cancel-subscription',
      event: 'SUBSCRIPTION_CANCELED',
      subject: '🛑 Suscripción cancelada',
      title: 'Suscripción cancelada',
      message: `La suscripción de ${restaurant.name} fue cancelada.`,
      data: {
        restaurantId,
        restaurantName: restaurant.name,
        subscriptionId: subscription.id,
        previousStatus: currentSubscription.status,
        newStatus: subscription.status,
        reason: reason || null,
        canceledAt: subscription.canceledAt?.toISOString?.() ?? null,
        currentPeriodEnd:
          subscription.currentPeriodEnd?.toISOString?.() ?? null,
      },
    });

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
    const { restaurant, subscription: currentSubscription } =
      await this.resolveRestaurantBilling(restaurantId);

    if (
      currentSubscription.status !== 'CANCELED' &&
      currentSubscription.status !== 'EXPIRED'
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
        where: { id: currentSubscription.planId },
      });
    }

    const now = new Date();
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const newPlanType = plan.id as PlanType;

    const subscription = await this.prisma.subscription.update({
      where: { id: currentSubscription.id },
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

    void this.adminAlerts?.notifyAdminEvent({
      source: 'super-admin.reactivate-subscription',
      event: 'SUBSCRIPTION_REACTIVATED',
      subject: '✅ Suscripción reactivada',
      title: 'Suscripción reactivada',
      message: `La suscripción de ${restaurant.name} fue reactivada en plan ${subscription.planType}.`,
      data: {
        restaurantId,
        restaurantName: restaurant.name,
        subscriptionId: subscription.id,
        previousStatus: currentSubscription.status,
        newStatus: subscription.status,
        planId: subscription.planId,
        planType: subscription.planType,
        currentPeriodStart:
          subscription.currentPeriodStart?.toISOString?.() ?? null,
        currentPeriodEnd:
          subscription.currentPeriodEnd?.toISOString?.() ?? null,
      },
    });

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
    const { restaurant, subscription: currentSubscription } =
      await this.resolveRestaurantBilling(restaurantId);

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
      where: { id: currentSubscription.id },
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

    void this.adminAlerts?.notifyAdminEvent({
      source: 'super-admin.toggle-trial',
      event: enableTrial ? 'TRIAL_ENABLED' : 'TRIAL_DISABLED',
      subject: enableTrial ? '🧪 Trial activado' : '📅 Trial desactivado',
      title: enableTrial ? 'Trial activado' : 'Trial desactivado',
      message: enableTrial
        ? `Se activó trial para ${restaurant.name}.`
        : `Se desactivó trial para ${restaurant.name}.`,
      data: {
        restaurantId,
        restaurantName: restaurant.name,
        subscriptionId: subscription.id,
        previousStatus: currentSubscription.status,
        newStatus: subscription.status,
        trialStart: subscription.trialStart?.toISOString?.() ?? null,
        trialEnd: subscription.trialEnd?.toISOString?.() ?? null,
      },
    });

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
    const { restaurant, subscription: currentSubscription } =
      await this.resolveRestaurantBilling(restaurantId);

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
      where: { id: currentSubscription.id },
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

    void this.adminAlerts?.notifyAdminEvent({
      source: 'super-admin.update-billing-controls',
      event: 'BILLING_CONTROLS_UPDATED',
      subject: '🧾 Controles de facturación actualizados',
      title: 'Cambios en facturación',
      message: `Se actualizaron controles de facturación para ${restaurant.name}.`,
      data: {
        restaurantId,
        restaurantName: restaurant.name,
        subscriptionId: subscription.id,
        isFreeAccount: subscription.isFreeAccount,
        discountPercentage: subscription.discountPercentage,
        discountReason: subscription.discountReason,
        discountGrantedBy: subscription.discountGrantedBy,
        discountGrantedAt:
          subscription.discountGrantedAt?.toISOString?.() ?? null,
      },
    });

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
