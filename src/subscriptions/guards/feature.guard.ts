import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { PLAN_NAMES } from '../constants';
import { PlanType } from '../dto';
import { PlanEntitlementsService } from '../plans/plan-entitlements.service';
import { SubscriptionResolverService } from '../subscription-resolver.service';

export const REQUIRED_FEATURE_KEY = 'requiredFeature';

/**
 * Decorador para marcar un endpoint como que requiere una feature específica
 */
export function RequireFeature(feature: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(REQUIRED_FEATURE_KEY, feature, descriptor.value);
    return descriptor;
  };
}

/**
 * Guard que verifica si el restaurante tiene acceso a una feature basado en su plan
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly planEntitlements: PlanEntitlementsService,
    private readonly subscriptionResolver: SubscriptionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.get<string>(
      REQUIRED_FEATURE_KEY,
      context.getHandler(),
    );

    // Si no hay feature requerida, permitir acceso
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // SUPER_ADMIN tiene acceso ilimitado a todas las features
    if (user && user.role === 'SUPER_ADMIN') {
      return true;
    }

    const restaurantId = request.params.restaurantId || request.params.id;

    if (!restaurantId) {
      throw new ForbiddenException({
        error: 'Restaurant ID no encontrado',
        requiredFeature,
      });
    }

    const subscription = await this.subscriptionResolver.resolveForRestaurant(
      restaurantId,
      { select: { status: true, planType: true, planId: true } },
    );

    if (!subscription) {
      throw new ForbiddenException({
        error: 'No se encontró suscripción',
        requiredFeature,
        message:
          'Este restaurante no tiene una suscripción activa. Por favor, suscríbete a un plan.',
      });
    }

    // Verificar estado de suscripción
    const activeStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ];

    if (!activeStatuses.includes(subscription.status)) {
      throw new ForbiddenException({
        error: 'Suscripción no activa',
        status: subscription.status,
        message:
          'Tu suscripción no está activa. Por favor, renueva tu plan para continuar.',
      });
    }

    const planType = subscription.planType as PlanType;
    const planId = subscription.planId || planType;
    const hasFeature = await this.planEntitlements.hasFeature(
      planId,
      requiredFeature,
    );

    if (!hasFeature) {
      const minimumPlan =
        await this.planEntitlements.getMinimumPlanForFeature(requiredFeature);
      const minimumPlanName = minimumPlan
        ? PLAN_NAMES[minimumPlan]
        : 'desconocido';

      throw new ForbiddenException({
        error: 'Feature no disponible en el plan actual',
        requiredFeature,
        currentPlan: planType,
        currentPlanName: PLAN_NAMES[planType],
        upgradeTo: minimumPlan,
        upgradeToPlanName: minimumPlanName,
        message: `Esta funcionalidad requiere el plan ${minimumPlanName} o superior.`,
      });
    }

    return true;
  }
}
