import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { PaymentProviderFactory } from '../payment-providers/payment-provider.factory';
import type { PaymentProviderName } from '../payment-providers/interfaces';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  CreateSubscriptionDto,
  CreateCheckoutDto,
  UpdateSubscriptionDto,
  PlanType,
} from './dto';
import {
  PLAN_NAMES,
  TRIAL_DAYS,
  GRACE_PERIOD_DAYS,
  isPlanUpgrade,
  adjustFeaturesForPlan,
} from './constants';
import { SubscriptionStatus, Prisma } from '@prisma/client';
import { addDays, addMonths, differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PlansService } from './plans/plans.service';
import { PlanEntitlementsService } from './plans/plan-entitlements.service';
import { SubscriptionResolverService } from './subscription-resolver.service';
import { isUnlimitedLimit } from './constants/plan-restrictions.fallback';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private mp: MercadoPagoConfig | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly mercadopagoService: MercadoPagoService,
    private readonly plansService: PlansService,
    private readonly planEntitlements: PlanEntitlementsService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly subscriptionResolver: SubscriptionResolverService,
  ) {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    if (accessToken) {
      this.mp = new MercadoPagoConfig({ accessToken });
    }
  }

  private async findBillingSubscription(
    restaurantId: string,
    args?: Parameters<SubscriptionResolverService['resolveForRestaurant']>[1],
  ) {
    return this.subscriptionResolver.resolveForRestaurant(restaurantId, args);
  }

  private async requireBillingSubscription(
    restaurantId: string,
    args?: Parameters<SubscriptionResolverService['resolveForRestaurant']>[1],
  ) {
    const subscription = await this.findBillingSubscription(restaurantId, args);
    if (!subscription) {
      throw new NotFoundException('No existe suscripción para esta cuenta');
    }
    return subscription;
  }

  private async syncOwnedRestaurantFeatures(
    restaurantId: string,
    planType: PlanType,
  ) {
    const ownerUserId =
      await this.subscriptionResolver.getBillingUserIdForRestaurant(
        restaurantId,
      );
    const targetRestaurantIds: string[] = [];

    if (ownerUserId) {
      const memberships = await this.prisma.restaurantMembership.findMany({
        where: { userId: ownerUserId },
        include: { role: { select: { name: true } } },
      });
      for (const membership of memberships) {
        const roleName = membership.role?.name ?? '';
        if (roleName === 'OWNER' || roleName === 'Admin') {
          targetRestaurantIds.push(membership.restaurantId);
        }
      }
    }

    if (targetRestaurantIds.length === 0) {
      targetRestaurantIds.push(restaurantId);
    }

    for (const id of targetRestaurantIds) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id },
        select: { features: true },
      });
      if (!restaurant) continue;
      const adjustedFeatures = adjustFeaturesForPlan(
        (restaurant.features as Record<string, unknown>) || {},
        planType,
      );
      await this.prisma.restaurant.update({
        where: { id },
        data: { features: adjustedFeatures },
      });
    }
  }

  /**
   * Crea (o retorna) el mpCustomerId para la suscripción del restaurante.
   */
  async ensureMpCustomer(
    restaurantId: string,
    metadata?: { email?: string; description?: string },
  ): Promise<string> {
    const existing = await this.findBillingSubscription(restaurantId, {
      select: { id: true, mpCustomerId: true },
    });

    if (existing?.mpCustomerId) return existing.mpCustomerId;

    if (!this.mercadopagoService) {
      throw new BadRequestException('MercadoPago no está configurado');
    }

    const mpCustomerId = await this.mercadopagoService.createCustomer(
      restaurantId,
      metadata,
      true,
    );
    const defaultPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: PlanType.STARTER },
    });
    const now = new Date();
    const isDefaultPlanPaid = (defaultPlan?.price ?? 0) > 0;
    const trialDays = defaultPlan?.trialDays || TRIAL_DAYS;
    const trialEnd = addDays(now, trialDays);
    const billingUserId =
      await this.subscriptionResolver.getBillingUserIdForRestaurant(
        restaurantId,
      );

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: { mpCustomerId },
      });
      return mpCustomerId;
    }

    await this.prisma.subscription.upsert({
      where: { restaurantId },
      create: {
        restaurant: { connect: { id: restaurantId } },
        ...(billingUserId ? { user: { connect: { id: billingUserId } } } : {}),
        plan: { connect: { id: PlanType.STARTER } },
        planType: PlanType.STARTER,
        status: isDefaultPlanPaid
          ? SubscriptionStatus.TRIALING
          : SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: isDefaultPlanPaid ? trialEnd : addMonths(now, 120),
        trialStart: isDefaultPlanPaid ? now : undefined,
        trialEnd: isDefaultPlanPaid ? trialEnd : undefined,
        nextPaymentDate: isDefaultPlanPaid ? trialEnd : undefined,
        isFreeAccount: !isDefaultPlanPaid,
        isBillingAnchor: true,
        mpCustomerId,
      } as any,
      update: { mpCustomerId },
    });

    return mpCustomerId;
  }

  /**
   * Añade un método de pago (tarjeta) usando card token desde frontend.
   */
  async addPaymentMethodFromToken(
    restaurantId: string,
    token: string,
  ): Promise<any> {
    if (!token) throw new BadRequestException('token es requerido');

    if (!this.mercadopagoService) {
      throw new BadRequestException('MercadoPago no está configurado');
    }

    // Asegurar mpCustomerId
    const mpCustomerId = await this.ensureMpCustomer(restaurantId);

    // Asociar tarjeta en MP
    let cardInfo: any;
    try {
      // Asociar la tarjeta en la cuenta GLOBAL de la plataforma (suscripciones)
      cardInfo = await this.mercadopagoService.createCardForCustomer(
        restaurantId,
        mpCustomerId,
        token,
        true,
      );
    } catch (e: any) {
      throw new BadRequestException({
        error: 'Error attaching card to MercadoPago',
        details: String(e.message ?? e),
      });
    }

    // Usar suscripción de cuenta (no crear fila duplicada por restaurante)
    let subscription = await this.findBillingSubscription(restaurantId);
    if (!subscription) {
      const billingUserId =
        await this.subscriptionResolver.getBillingUserIdForRestaurant(
          restaurantId,
        );
      subscription = await this.prisma.subscription.create({
        data: {
          restaurant: { connect: { id: restaurantId } },
          ...(billingUserId
            ? { user: { connect: { id: billingUserId } } }
            : {}),
          plan: { connect: { id: 'STARTER' } },
          planType: 'STARTER',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(
            Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
          ),
          isFreeAccount: true,
          isBillingAnchor: true,
          mpCustomerId,
        } as any,
      });
    }

    // ¿es default? si no hay otros
    const existingCount = await this.prisma.subscriptionPaymentMethod.count({
      where: { subscriptionId: subscription.id },
    });

    const pm = await this.prisma.subscriptionPaymentMethod.create({
      data: {
        subscription: { connect: { id: subscription.id } },
        type: 'credit_card',
        brand:
          cardInfo?.card?.brand ||
          cardInfo?.card?.issuer?.name?.toLowerCase() ||
          'card',
        issuerId: cardInfo?.card?.issuer?.id ?? null,
        issuerName: cardInfo?.card?.issuer?.name ?? null,
        last4:
          cardInfo?.last_four ||
          cardInfo?.last_four_digits ||
          cardInfo?.card?.last_four ||
          cardInfo?.card?.last_four_digits ||
          '',
        expiryMonth: Number(
          cardInfo?.card?.expiration_month || cardInfo?.expiration_month || 0,
        ),
        expiryYear: Number(
          cardInfo?.card?.expiration_year || cardInfo?.expiration_year || 0,
        ),
        isDefault: existingCount === 0,
        mpCardId: String(cardInfo.id ?? cardInfo.card?.id ?? ''),
      },
    });

    // Si es el método por defecto, actualizar la suscripción
    if (pm.isDefault) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { paymentMethodId: pm.id },
      });
    }

    // If issuer info missing, try to fetch full card details and update
    try {
      if ((!pm.issuerId || !pm.issuerName) && mpCustomerId && pm.mpCardId) {
        const full = await this.mercadopagoService
          .getCardForCustomer(restaurantId, mpCustomerId, pm.mpCardId, true)
          .catch(() => null);
        if (full) {
          const issuerId = full?.card?.issuer?.id ?? null;
          const issuerName = full?.card?.issuer?.name ?? null;
          if (issuerId || issuerName) {
            const updated = await this.prisma.subscriptionPaymentMethod.update({
              where: { id: pm.id },
              data: { issuerId, issuerName },
            });
            return {
              paymentMethod: {
                id: updated.id,
                mpCardId: updated.mpCardId,
                mpCustomerId: mpCustomerId,
                brand: updated.brand,
                issuerId: updated.issuerId ?? null,
                issuerName: updated.issuerName ?? null,
                last4: updated.last4,
                expMonth: String(updated.expiryMonth).padStart(2, '0'),
                expYear: String(updated.expiryYear),
                cardholderName:
                  cardInfo?.card?.cardholder?.name ||
                  cardInfo?.cardholder?.name ||
                  null,
                isDefault: updated.isDefault,
                createdAt: updated.createdAt,
              },
            };
          }
        }
      }
    } catch {
      // ignore
    }

    return {
      paymentMethod: {
        id: pm.id,
        mpCardId: pm.mpCardId,
        mpCustomerId: mpCustomerId,
        brand: pm.brand,
        issuerId: pm.issuerId ?? null,
        issuerName: pm.issuerName ?? null,
        last4: pm.last4,
        expMonth: String(pm.expiryMonth).padStart(2, '0'),
        expYear: String(pm.expiryYear),
        cardholderName:
          cardInfo?.card?.cardholder?.name ||
          cardInfo?.cardholder?.name ||
          null,
        isDefault: pm.isDefault,
        createdAt: pm.createdAt,
      },
    };
  }

  async listPaymentMethods(restaurantId: string) {
    const subscription = (await this.findBillingSubscription(restaurantId, {
      include: { paymentMethods: true },
    })) as Prisma.SubscriptionGetPayload<{
      include: { paymentMethods: true };
    }> | null;

    if (!subscription) return { paymentMethods: [] };

    const paymentMethods = subscription.paymentMethods.map((pm) => ({
      id: pm.id,
      mpCardId: pm.mpCardId,
      mpCustomerId: subscription.mpCustomerId ?? null,
      brand: pm.brand,
      issuerId: pm.issuerId ?? null,
      issuerName: pm.issuerName ?? null,
      last4: pm.last4,
      expMonth: String(pm.expiryMonth).padStart(2, '0'),
      expYear: String(pm.expiryYear),
      cardholderName: null,
      issuer: pm.issuerName
        ? { name: pm.issuerName, id: pm.issuerId }
        : pm.brand
          ? { name: pm.brand, id: null }
          : null,
      isDefault: pm.isDefault,
      createdAt: pm.createdAt,
    }));

    // Order: default methods first, then by createdAt
    paymentMethods.sort((a, b) => {
      if (a.isDefault === b.isDefault) {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      }
      return a.isDefault ? -1 : 1;
    });

    return { paymentMethods };
  }

  async removePaymentMethod(restaurantId: string, paymentMethodId: string) {
    const subscription = await this.requireBillingSubscription(restaurantId, {
      include: { paymentMethods: true },
    });

    const pm = await this.prisma.subscriptionPaymentMethod.findUnique({
      where: { id: paymentMethodId },
    });

    if (!pm || pm.subscriptionId !== subscription.id) {
      throw new NotFoundException('Payment method not found');
    }

    // Intentar borrar en MP
    if (subscription.mpCustomerId && pm.mpCardId && this.mercadopagoService) {
      try {
        await this.mercadopagoService.deleteCardForCustomer(
          restaurantId,
          subscription.mpCustomerId,
          pm.mpCardId,
        );
      } catch (e) {
        // Propagar como error 502
        throw new BadRequestException({
          error: 'Error deleting card in MercadoPago',
          details: String(e.message ?? e),
        });
      }
    }

    await this.prisma.subscriptionPaymentMethod.delete({
      where: { id: paymentMethodId },
    });
  }

  /**
   * Set preferred payment method for the restaurant's subscription.
   * Accepts either a subscriptionPaymentMethodId (card stored under subscription)
   * or a userPaymentMethodId (card stored per user). It updates the subscription
   * row and marks the selected SubscriptionPaymentMethod as default.
   */
  async setPreferredPaymentMethod(
    restaurantId: string,
    body: {
      subscriptionPaymentMethodId?: string;
      userPaymentMethodId?: string;
    },
    userId?: string,
  ) {
    const subscription = await this.requireBillingSubscription(restaurantId, {
      include: { paymentMethods: true },
    });

    const updates: any = {};

    if (body.subscriptionPaymentMethodId) {
      const pm = await this.prisma.subscriptionPaymentMethod.findUnique({
        where: { id: body.subscriptionPaymentMethodId },
      });
      if (!pm || pm.subscriptionId !== subscription.id)
        throw new BadRequestException('Invalid subscription payment method');

      updates.paymentMethodId = body.subscriptionPaymentMethodId;

      // Unset other defaults and set this one
      await this.prisma.subscriptionPaymentMethod.updateMany({
        where: { subscriptionId: subscription.id },
        data: { isDefault: false },
      });
      await this.prisma.subscriptionPaymentMethod.update({
        where: { id: body.subscriptionPaymentMethodId },
        data: { isDefault: true },
      });
    }

    let selectedUserPaymentMethod: any = null;
    if (body.userPaymentMethodId) {
      if (!userId)
        throw new BadRequestException(
          'User context required to set user preferred payment method',
        );
      const upm = await this.prisma.userPaymentMethod.findUnique({
        where: { id: body.userPaymentMethodId },
      });
      if (!upm || upm.userId !== userId)
        throw new BadRequestException('Invalid user payment method');

      // Unset other defaults for this user and set the chosen one
      await this.prisma.userPaymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
      selectedUserPaymentMethod = await this.prisma.userPaymentMethod.update({
        where: { id: body.userPaymentMethodId },
        data: { isDefault: true },
      });

      // We intentionally do NOT change subscription.userPaymentMethodId here: preference is per-user.
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: updates,
    });
    return { subscription: updated, selectedUserPaymentMethod };
  }

  /**
   * Obtener suscripción actual de un restaurante (hereda plan de la cuenta del dueño)
   */
  async getSubscription(restaurantId: string, userId?: string) {
    const subscription = (await this.subscriptionResolver.resolveForRestaurant(
      restaurantId,
      {
        include: {
          plan: {
            include: {
              restrictions: true,
            },
          },
          invoices: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          paymentMethods: {
            orderBy: { isDefault: 'desc' },
          },
        },
      },
    )) as Prisma.SubscriptionGetPayload<{
      include: {
        plan: { include: { restrictions: true } };
        invoices: true;
        paymentMethods: true;
      };
    }> | null;

    if (!subscription) {
      return { subscription: null };
    }

    const allPaymentMethods = await this.buildSubscriptionPaymentMethods(
      subscription,
      userId,
    );

    return {
      subscription: { ...subscription, paymentMethods: allPaymentMethods },
    };
  }

  private async buildSubscriptionPaymentMethods(
    subscription: Prisma.SubscriptionGetPayload<{
      include: { paymentMethods: true };
    }>,
    userId?: string,
  ) {
    let allPaymentMethods: any[] =
      subscription.paymentMethods.map((pm) => ({
        id: pm.id,
        mpCardId: pm.mpCardId,
        mpCustomerId: subscription.mpCustomerId ?? null,
        brand: pm.brand,
        issuerId: pm.issuerId ?? null,
        issuerName: pm.issuerName ?? null,
        last4: pm.last4,
        expMonth: String(pm.expiryMonth).padStart(2, '0'),
        expYear: String(pm.expiryYear),
        cardholderName: null,
        issuer: pm.issuerName
          ? { name: pm.issuerName, id: pm.issuerId }
          : pm.brand
            ? { name: pm.brand, id: null }
            : null,
        isDefault: pm.isDefault,
        createdAt: pm.createdAt,
        type: 'subscription' as const,
      })) || [];

    if (userId) {
      const userMethods = await this.prisma.userPaymentMethod.findMany({
        where: { userId },
        orderBy: { isDefault: 'desc' },
      });

      const mappedUserMethods = userMethods.map((pm) => ({
        id: pm.id,
        mpCardId: pm.mpCardId,
        mpCustomerId: pm.mpCustomerId,
        brand: pm.brand,
        issuerId: pm.issuerId ?? null,
        issuerName: pm.issuerName ?? null,
        last4: pm.last4,
        expMonth: String(pm.expiryMonth).padStart(2, '0'),
        expYear: String(pm.expiryYear),
        cardholderName: pm.cardholderName,
        issuer: pm.issuerName
          ? { name: pm.issuerName, id: pm.issuerId }
          : pm.brand
            ? { name: pm.brand, id: null }
            : null,
        isDefault: pm.isDefault,
        createdAt: pm.createdAt,
        type: 'user' as const,
      }));

      allPaymentMethods = [...allPaymentMethods, ...mappedUserMethods];
    }

    return allPaymentMethods;
  }

  /**
   * Obtener resumen de suscripción con métricas calculadas
   */
  async getSubscriptionSummary(restaurantId: string) {
    const { subscription } = await this.getSubscription(restaurantId);

    if (!subscription) {
      return {
        subscription: null,
        trialDaysRemaining: 0,
        isTrialing: false,
        canUpgrade: true,
        canDowngrade: false,
        nextBillingDate: null,
        nextBillingAmount: 0,
      };
    }

    const now = new Date();
    const isTrialing = subscription.status === SubscriptionStatus.TRIALING;
    const trialDaysRemaining = subscription.trialEnd
      ? Math.max(0, differenceInDays(subscription.trialEnd, now))
      : 0;

    const planType = subscription.planType as PlanType;
    const canUpgrade = planType !== PlanType.ENTERPRISE;
    const canDowngrade = planType !== PlanType.STARTER;

    let nextBillingDate: Date | null = null;
    let nextBillingAmount = 0;

    const currentPlan =
      subscription.plan ??
      (await this.plansService.findOne(subscription.planId).catch(() => null));
    const planPrice = currentPlan?.price || 0;

    if (isTrialing && subscription.trialEnd) {
      nextBillingDate = subscription.trialEnd;
      nextBillingAmount = planPrice;
    } else if (subscription.status === SubscriptionStatus.ACTIVE) {
      nextBillingDate = subscription.currentPeriodEnd;
      nextBillingAmount = planPrice;
    }

    return {
      subscription,
      trialDaysRemaining,
      isTrialing,
      canUpgrade,
      canDowngrade,
      nextBillingDate,
      nextBillingAmount,
    };
  }

  /**
   * Crear nueva suscripción
   */
  async createSubscription(restaurantId: string, dto: CreateSubscriptionDto) {
    const existing = await this.findBillingSubscription(restaurantId);

    if (
      existing &&
      existing.status !== SubscriptionStatus.EXPIRED &&
      existing.status !== SubscriptionStatus.CANCELED
    ) {
      throw new ConflictException(
        'Ya existe una suscripción activa para esta cuenta',
      );
    }

    const now = new Date();
    const planType = dto.planType;
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planType },
    });

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    if (!plan.isActive) {
      throw new BadRequestException('El plan seleccionado no está activo');
    }

    const isPaidPlan = plan.price > 0;
    const trialDays = plan.trialDays || TRIAL_DAYS;

    let subscriptionData: Prisma.SubscriptionCreateInput;

    const billingUserId =
      await this.subscriptionResolver.getBillingUserIdForRestaurant(
        restaurantId,
      );

    if (!isPaidPlan) {
      subscriptionData = {
        restaurant: { connect: { id: restaurantId } },
        ...(billingUserId ? { user: { connect: { id: billingUserId } } } : {}),
        plan: { connect: { id: plan.id } },
        planType,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        isFreeAccount: true,
        isBillingAnchor: true,
        currentPeriodEnd: addMonths(now, 120),
      };
    } else {
      const trialEnd = addDays(now, trialDays);
      subscriptionData = {
        restaurant: { connect: { id: restaurantId } },
        ...(billingUserId ? { user: { connect: { id: billingUserId } } } : {}),
        plan: { connect: { id: plan.id } },
        planType,
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialStart: now,
        trialEnd,
        nextPaymentDate: trialEnd,
        isFreeAccount: false,
        isBillingAnchor: true,
      };
    }

    let subscription;
    if (existing) {
      subscription = await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          ...subscriptionData,
          restaurant: undefined,
          canceledAt: null,
          cancelAtPeriodEnd: false,
        },
      });
    } else {
      subscription = await this.prisma.subscription.create({
        data: subscriptionData,
      });
    }

    this.logger.log(
      `Suscripción creada: ${subscription.id} - Plan: ${planType}`,
    );

    // Enviar email de bienvenida para planes con trial
    if (isPaidPlan && subscription.trialEnd) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { email: true, name: true },
      });

      if (restaurant?.email) {
        await this.emailService.sendWelcomeTrialEmail(
          restaurant.email,
          restaurant.name,
          PLAN_NAMES[planType],
          subscription.trialEnd,
        );
      }
    }

    return {
      subscription,
      checkoutUrl: null,
    };
  }

  /**
   * Crear checkout para suscripción (MercadoPago o Payway)
   */
  async createCheckout(
    restaurantId: string,
    dto: CreateCheckoutDto,
    user?: RequestUser,
  ) {
    // Verificar si el usuario es SUPER_ADMIN
    if (user && user.role === 'SUPER_ADMIN') {
      const updateResult = await this.updateSubscription(
        restaurantId,
        { planType: dto.planType },
        user,
      );
      return {
        checkoutUrl: null,
        subscription: updateResult.subscription,
        message: updateResult.message,
      };
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, email: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const plan = await this.plansService.findOne(dto.planType);
    const price = plan.price;
    if (price === 0) {
      throw new BadRequestException(
        'El plan Starter es gratuito, no requiere checkout',
      );
    }

    const providerName: PaymentProviderName =
      dto.paymentProvider || 'mercadopago';
    const backendUrl = this.configService.get('BACKEND_URL');
    const externalRef = `sub_${restaurantId}_${dto.planType}`;
    const webhookUrl =
      providerName === 'payway'
        ? `${backendUrl}/api/webhooks/payway`
        : `${backendUrl}/api/webhooks/mercadopago/subscription`;

    // Si se solicita Payway y hay credenciales, usar el provider abstraction
    if (providerName === 'payway') {
      const provider = this.paymentProviderFactory.getProvider('payway');
      const result = await provider.createCheckout({
        orderId: externalRef,
        restaurantId,
        items: [
          {
            id: `plan_${dto.planType.toLowerCase()}`,
            title: `Plan ${PLAN_NAMES[dto.planType]} - Bentoo`,
            description: `Suscripción mensual al plan ${PLAN_NAMES[dto.planType]}`,
            quantity: 1,
            unitPrice: price, // ya en centavos
          },
        ],
        totalAmount: price,
        currency: 'ARS',
        externalReference: externalRef,
        notificationUrl: webhookUrl,
        customer: {
          name: restaurant.name || '',
          email: restaurant.email || '',
        },
        backUrls: {
          success: dto.successUrl || '',
          failure: dto.cancelUrl || '',
          pending: dto.cancelUrl || '',
        },
        metadata: { type: 'subscription', planType: dto.planType },
      });

      return {
        checkoutUrl: result.checkoutUrl,
        providerSessionId: result.providerSessionId,
        paymentProvider: 'payway',
      };
    }

    // Default: MercadoPago (código original)
    if (!this.mp) {
      throw new BadRequestException('MercadoPago no está configurado');
    }

    const unitPrice = price / 100; // centavos → pesos para MP

    const preference = new Preference(this.mp);

    const backUrls: any = {};
    if (dto.successUrl && dto.successUrl.trim())
      backUrls.success = dto.successUrl;
    if (dto.cancelUrl && dto.cancelUrl.trim()) backUrls.failure = dto.cancelUrl;
    if (dto.cancelUrl && dto.cancelUrl.trim()) backUrls.pending = dto.cancelUrl;

    this.logger.log(
      `backUrls: ${JSON.stringify(backUrls)}, successUrl: "${dto.successUrl}", auto_return: ${!!(dto.successUrl && dto.successUrl.trim())}`,
    );

    const preferenceData: any = {
      body: {
        items: [
          {
            id: `plan_${dto.planType.toLowerCase()}`,
            title: `Plan ${PLAN_NAMES[dto.planType]} - Bentoo`,
            description: `Suscripción mensual al plan ${PLAN_NAMES[dto.planType]}`,
            quantity: 1,
            currency_id: 'ARS',
            unit_price: unitPrice,
          },
        ],
        back_urls: backUrls,
        external_reference: externalRef,
        metadata: {
          restaurantId,
          planType: dto.planType,
          type: 'subscription',
        },
        notification_url: webhookUrl,
      },
    };

    if (
      dto.successUrl &&
      dto.successUrl.trim() &&
      !dto.successUrl.includes('localhost')
    ) {
      preferenceData.body.auto_return = 'approved';
    }

    const result = await preference.create(preferenceData);

    return {
      checkoutUrl: result.init_point,
      preferenceId: result.id,
      paymentProvider: 'mercadopago',
    };
  }

  /**
   * Actualizar plan de suscripción (upgrade/downgrade)
   */
  async updateSubscription(
    restaurantId: string,
    dto: UpdateSubscriptionDto,
    user?: RequestUser,
  ) {
    void user;
    const subscription = await this.requireBillingSubscription(restaurantId);

    if (
      subscription.status === SubscriptionStatus.CANCELED ||
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
      throw new BadRequestException('La suscripción no está activa');
    }

    const currentPlan = subscription.planType as PlanType;
    const newPlan = dto.planType;

    const newPlanRecord = await this.prisma.subscriptionPlan.findUnique({
      where: { id: newPlan },
    });

    if (!newPlanRecord) {
      throw new NotFoundException('Plan no encontrado');
    }

    if (!newPlanRecord.isActive) {
      throw new BadRequestException('El plan seleccionado no está activo');
    }

    const isNewPlanFree = newPlanRecord.price === 0;

    if (currentPlan === newPlan) {
      throw new BadRequestException('Ya tienes este plan');
    }

    const isUpgrade = isPlanUpgrade(currentPlan, newPlan);
    let message: string;

    if (isUpgrade) {
      const updateData: any = {
        planId: newPlan,
        planType: newPlan,
        isFreeAccount: isNewPlanFree,
      };

      if (subscription.status === SubscriptionStatus.TRIALING) {
        updateData.status = SubscriptionStatus.ACTIVE;
        updateData.trialEnd = null;
        updateData.currentPeriodStart = new Date();
        updateData.currentPeriodEnd = addMonths(new Date(), 1);
        updateData.nextPaymentDate = addMonths(new Date(), 1);
        message =
          'Plan adquirido. La suscripción ahora está activa y el período de prueba ha terminado.';
      } else {
        updateData.nextPaymentDate = subscription.currentPeriodEnd;
        message = 'Plan actualizado. El cambio se aplicó inmediatamente.';
      }

      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });

      await this.syncOwnedRestaurantFeatures(restaurantId, newPlan);
    } else {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: newPlan,
          planType: newPlan,
          isFreeAccount: isNewPlanFree,
        },
      });

      await this.syncOwnedRestaurantFeatures(restaurantId, newPlan);

      message = `Plan actualizado. El cambio se aplicará al final del período actual (${format(subscription.currentPeriodEnd, "d 'de' MMMM", { locale: es })}). Algunas funcionalidades han sido deshabilitadas según tu nuevo plan.`;
    }

    const updatedSubscription = await this.prisma.subscription.findUnique({
      where: { id: subscription.id },
    });

    return {
      subscription: updatedSubscription,
      message,
    };
  }

  /**
   * Cancelar suscripción
   */
  async cancelSubscription(restaurantId: string) {
    const subscription = await this.requireBillingSubscription(restaurantId);

    if (subscription.status === SubscriptionStatus.CANCELED) {
      throw new BadRequestException('La suscripción ya está cancelada');
    }

    const updatedSubscription = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      },
    });

    const endDate = format(
      subscription.currentPeriodEnd,
      "d 'de' MMMM 'de' yyyy",
      { locale: es },
    );

    // Enviar email de confirmación de cancelación
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { email: true, name: true },
    });

    if (restaurant?.email) {
      const planType = subscription.planType as PlanType;
      await this.emailService.sendSubscriptionCanceledEmail(
        restaurant.email,
        restaurant.name,
        PLAN_NAMES[planType],
        subscription.currentPeriodEnd,
      );
    }

    return {
      subscription: updatedSubscription,
      message: `Suscripción cancelada. Tendrás acceso hasta el ${endDate}.`,
    };
  }

  /**
   * Cambiar plan de suscripción (upgrade/downgrade)
   */
  async upgradePlan(restaurantId: string, newPlanId: string) {
    // Verificar que el plan existe
    const newPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: newPlanId },
      include: { restrictions: true },
    });

    if (!newPlan) {
      throw new NotFoundException(`Plan con ID ${newPlanId} no encontrado`);
    }

    if (!newPlan.isActive) {
      throw new BadRequestException(
        `El plan ${newPlan.displayName} no está disponible`,
      );
    }

    const subscription = await this.requireBillingSubscription(restaurantId, {
      include: { plan: true },
    });

    if (subscription.planId === newPlanId) {
      throw new BadRequestException('Ya estás en este plan');
    }

    // Actualizar plan
    const updatedSubscription = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: newPlanId,
        planType: newPlanId as any,
      },
      include: {
        plan: {
          include: {
            restrictions: true,
          },
        },
      },
    });

    await this.syncOwnedRestaurantFeatures(restaurantId, newPlanId as PlanType);

    this.logger.log(
      `Restaurant ${restaurantId} cambió de plan ${subscription.planId} a ${newPlanId}`,
    );

    return {
      subscription: updatedSubscription,
      message: `Plan cambiado exitosamente a ${newPlan.displayName}`,
    };
  }

  /**
   * Reactivar suscripción cancelada
   */
  async reactivateSubscription(restaurantId: string) {
    const subscription = await this.requireBillingSubscription(restaurantId);

    if (
      !subscription.cancelAtPeriodEnd &&
      subscription.status !== SubscriptionStatus.CANCELED
    ) {
      throw new BadRequestException('La suscripción no está cancelada');
    }

    // Si el período ya expiró, necesita un nuevo checkout
    if (subscription.currentPeriodEnd < new Date()) {
      throw new BadRequestException(
        'El período de suscripción ya expiró. Por favor, crea una nueva suscripción.',
      );
    }

    const updatedSubscription = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        canceledAt: null,
        status:
          subscription.status === SubscriptionStatus.CANCELED
            ? SubscriptionStatus.ACTIVE
            : subscription.status,
      },
    });

    // Enviar email de reactivación
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { email: true, name: true },
    });

    if (restaurant?.email) {
      const planType = subscription.planType as PlanType;
      await this.emailService.sendSubscriptionReactivatedEmail(
        restaurant.email,
        restaurant.name,
        PLAN_NAMES[planType],
      );
    }

    return {
      subscription: updatedSubscription,
      message: 'Suscripción reactivada exitosamente.',
    };
  }

  /**
   * Obtener facturas de la suscripción
   */
  async getInvoices(restaurantId: string) {
    const subscription = await this.findBillingSubscription(restaurantId, {
      select: { id: true },
    });

    if (!subscription) {
      return { invoices: [] };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    });

    return { invoices };
  }

  /**
   * Generar recibo HTML para una factura
   */
  async getInvoiceReceipt(
    restaurantId: string,
    invoiceId: string,
  ): Promise<string> {
    const billingSubscription = await this.findBillingSubscription(
      restaurantId,
      { select: { id: true } },
    );
    if (!billingSubscription) {
      throw new NotFoundException('Factura no encontrada');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        subscriptionId: billingSubscription.id,
      },
      include: {
        subscription: {
          include: {
            restaurant: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    const restaurant = invoice.subscription?.restaurant;
    const planType = invoice.subscription?.planType as PlanType;
    const planName = PLAN_NAMES[planType] || planType;
    const amount = (invoice.amount / 100).toLocaleString('es-AR', {
      style: 'currency',
      currency: invoice.currency || 'ARS',
    });
    const date = invoice.paidAt
      ? format(invoice.paidAt, "d 'de' MMMM 'de' yyyy", { locale: es })
      : format(invoice.createdAt, "d 'de' MMMM 'de' yyyy", { locale: es });

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo - ${invoice.id.slice(0, 8)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; color: #1a1a1a; }
  .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { color: #10b981; margin: 0; font-size: 24px; }
  .header p { color: #666; margin: 5px 0 0; }
  .details { margin: 20px 0; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
  .row:last-child { border-bottom: none; }
  .label { color: #666; }
  .value { font-weight: 600; }
  .total { font-size: 20px; text-align: right; margin-top: 20px; padding-top: 20px; border-top: 2px solid #1a1a1a; }
  .footer { text-align: center; color: #999; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="header">
    <h1>Bentoo</h1>
    <p>Recibo de pago</p>
  </div>
  <div class="details">
    <div class="row"><span class="label">Número</span><span class="value">#${invoice.id.slice(0, 8).toUpperCase()}</span></div>
    <div class="row"><span class="label">Fecha</span><span class="value">${date}</span></div>
    <div class="row"><span class="label">Restaurante</span><span class="value">${restaurant?.name || '—'}</span></div>
    <div class="row"><span class="label">Plan</span><span class="value">${planName}</span></div>
    <div class="row"><span class="label">Estado</span><span class="value">${invoice.status === 'paid' ? 'Pagado' : 'Pendiente'}</span></div>
    ${invoice.mpPaymentId ? `<div class="row"><span class="label">ID de pago</span><span class="value">${invoice.mpPaymentId}</span></div>` : ''}
  </div>
  <div class="total">Total: ${amount}</div>
  <div class="footer">
    <p>Este recibo fue generado automáticamente por Bentoo.</p>
    <p>Para consultas: soporte@bentoo.app</p>
  </div>
</body>
</html>`;
  }

  /**
   * Procesar pago aprobado de suscripción (llamado desde webhook o cron)
   * Usa transacción atómica para garantizar consistencia entre subscription e invoice
   * Implementa idempotencia por paymentId para evitar procesar el mismo pago dos veces
   */
  async processPaymentApproved(
    restaurantId: string,
    planType: PlanType,
    paymentId: string,
    amount: number,
  ) {
    // Verificar si hay un usuario SUPER_ADMIN en el restaurante
    const superAdminUser = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        role: {
          name: 'SUPER_ADMIN',
        },
      },
    });

    if (superAdminUser) {
      this.logger.warn(
        `Payment ${paymentId} skipped for restaurant ${restaurantId} because it has a SUPER_ADMIN user`,
      );
      // Retornar la suscripción existente sin procesar pago
      const existingSub = await this.findBillingSubscription(restaurantId);
      return existingSub;
    }

    // Idempotencia: verificar si este pago ya fue procesado
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: { mpPaymentId: paymentId },
    });

    if (existingInvoice) {
      this.logger.warn(
        `Payment ${paymentId} already processed (invoice ${existingInvoice.id}), skipping`,
      );
      // Retornar la suscripción existente
      const existingSub = await this.findBillingSubscription(restaurantId);
      return existingSub;
    }

    const now = new Date();
    const nextBillingDate = addMonths(now, 1);

    // Usar transacción atómica para garantizar consistencia
    const billingUserId =
      await this.subscriptionResolver.getBillingUserIdForRestaurant(
        restaurantId,
      );

    const result = await this.prisma.$transaction(async (tx) => {
      const existingBilling = await tx.subscription.findFirst({
        where: billingUserId
          ? { userId: billingUserId, isBillingAnchor: true }
          : { restaurantId },
      });

      const subscription = existingBilling
        ? await tx.subscription.update({
            where: { id: existingBilling.id },
            data: {
              planType,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: now,
              currentPeriodEnd: nextBillingDate,
              lastPaymentDate: now,
              lastPaymentAmount: amount,
              nextPaymentDate: nextBillingDate,
              trialEnd: null,
              cancelAtPeriodEnd: false,
              canceledAt: null,
            },
          })
        : await tx.subscription.create({
            data: {
              restaurant: { connect: { id: restaurantId } },
              ...(billingUserId
                ? { user: { connect: { id: billingUserId } } }
                : {}),
              planType,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: now,
              currentPeriodEnd: nextBillingDate,
              lastPaymentDate: now,
              lastPaymentAmount: amount,
              nextPaymentDate: nextBillingDate,
              isBillingAnchor: true,
            },
          });

      // Crear factura dentro de la misma transacción
      await tx.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amount,
          status: 'paid',
          mpPaymentId: paymentId,
          paidAt: now,
        },
      });

      return subscription;
    });

    // Enviar email de pago exitoso (fuera de transacción, no crítico)
    try {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { email: true, name: true },
      });

      if (restaurant?.email && amount > 0) {
        await this.emailService.sendPaymentSuccessEmail(
          restaurant.email,
          restaurant.name,
          PLAN_NAMES[planType],
          amount,
          nextBillingDate,
        );
      }
    } catch (emailError: any) {
      this.logger.error(
        `Failed to send payment success email for ${restaurantId}: ${emailError.message}`,
      );
      // No lanzar error, el pago ya fue procesado exitosamente
    }

    this.logger.log(
      `Pago procesado para suscripción ${result.id}, paymentId: ${paymentId}`,
    );

    return result;
  }

  /**
   * Marcar suscripción como vencida (llamado desde cron)
   */
  async markAsPastDue(subscriptionId: string) {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
  }

  /**
   * Período de gracia tras trial sin método de pago: mantiene acceso unos días
   * mientras el usuario agrega tarjeta.
   */
  async markTrialGracePeriod(subscriptionId: string) {
    const graceEnd = addDays(new Date(), GRACE_PERIOD_DAYS);
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodEnd: graceEnd,
      },
    });
  }

  /**
   * Marcar suscripción como expirada (llamado desde cron)
   */
  async markAsExpired(subscriptionId: string) {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.EXPIRED },
    });
  }

  /**
   * Obtener suscripciones con trial expirado
   */
  async getExpiredTrials() {
    return this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.TRIALING,
        trialEnd: { lt: new Date() },
      },
      include: {
        restaurant: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Obtener suscripciones que necesitan renovación
   */
  async getSubscriptionsToRenew() {
    return this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { lte: new Date() },
        cancelAtPeriodEnd: false,
      },
      include: {
        restaurant: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Extender período de suscripción sin cobrar (para cuentas gratuitas)
   */
  async extendPeriodWithoutCharge(subscriptionId: string) {
    const now = new Date();
    const nextPeriodEnd = new Date(now);
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: nextPeriodEnd,
        updatedAt: now,
      },
    });
  }

  /**
   * Obtener suscripciones canceladas que deben finalizar
   */
  async getCanceledSubscriptionsToFinalize() {
    return this.prisma.subscription.findMany({
      where: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: new Date() },
        status: { not: SubscriptionStatus.CANCELED },
      },
    });
  }

  /**
   * Finalizar suscripciones canceladas
   */
  async finalizeSubscription(subscriptionId: string) {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.CANCELED },
    });
  }

  /**
   * Suscripción de la cuenta del usuario (fuente de verdad de billing).
   */
  async getAccountSubscription(
    userId: string,
    options?: { minimal?: boolean },
  ) {
    if (options?.minimal) {
      const subscription = await this.subscriptionResolver.resolveForUser(
        userId,
        {
          select: {
            id: true,
            planType: true,
            status: true,
            trialEnd: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            restaurantId: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
            updatedAt: true,
            planId: true,
            userId: true,
            isBillingAnchor: true,
          },
        },
      );
      return { subscription: subscription ?? null };
    }

    const subscription = (await this.subscriptionResolver.resolveForUser(
      userId,
      {
        include: {
          plan: {
            include: {
              restrictions: true,
            },
          },
          invoices: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          paymentMethods: {
            orderBy: { isDefault: 'desc' },
          },
        },
      },
    )) as Prisma.SubscriptionGetPayload<{
      include: {
        plan: { include: { restrictions: true } };
        invoices: true;
        paymentMethods: true;
      };
    }> | null;

    if (!subscription) {
      return { subscription: null };
    }

    const allPaymentMethods = await this.buildSubscriptionPaymentMethods(
      subscription,
      userId,
    );

    return {
      subscription: { ...subscription, paymentMethods: allPaymentMethods },
    };
  }

  async getAccountInvoices(userId: string) {
    const anchor = await this.subscriptionResolver.resolveForUser(userId, {
      select: { restaurantId: true },
    });
    if (!anchor?.restaurantId) {
      return { invoices: [] };
    }
    return this.getInvoices(anchor.restaurantId);
  }

  async getAccountSubscriptionSummary(userId: string) {
    const { subscription } = await this.getAccountSubscription(userId);
    if (!subscription?.restaurantId) {
      return {
        subscription: null,
        trialDaysRemaining: 0,
        isTrialing: false,
        canUpgrade: true,
        canDowngrade: false,
        nextBillingDate: null,
        nextBillingAmount: 0,
      };
    }
    return this.getSubscriptionSummary(subscription.restaurantId);
  }

  /**
   * Verifica si el dueño puede crear otro restaurante según su plan.
   */
  async assertCanAddRestaurant(userId: string): Promise<void> {
    const ownedCount =
      await this.subscriptionResolver.countOwnedRestaurants(userId);
    const planId = await this.resolveAccountPlanId(userId);
    const maxRestaurants = await this.planEntitlements.getLimit(
      planId,
      'restaurants',
    );
    const effectiveMax =
      maxRestaurants === 0
        ? this.getFallbackRestaurantLimit(planId)
        : maxRestaurants;

    if (isUnlimitedLimit(effectiveMax)) return;

    if (ownedCount >= effectiveMax) {
      throw new BadRequestException(
        `Tu plan actual permite hasta ${effectiveMax} restaurante${effectiveMax === 1 ? '' : 's'}. Actualizá tu plan para agregar más locales.`,
      );
    }
  }

  /**
   * Vincula la suscripción del restaurante al userId del dueño (migración / primer alta).
   */
  async linkOwnerToRestaurantSubscription(
    userId: string,
    restaurantId: string,
  ): Promise<void> {
    const restaurantSub = await this.prisma.subscription.findUnique({
      where: { restaurantId },
    });
    if (!restaurantSub) return;

    const existingAccountSub = await this.prisma.subscription.findFirst({
      where: { userId, isBillingAnchor: true },
    });

    if (existingAccountSub && existingAccountSub.id !== restaurantSub.id) {
      await this.prisma.subscription.update({
        where: { id: restaurantSub.id },
        data: { isBillingAnchor: false },
      });
      return;
    }

    if (!restaurantSub.userId) {
      await this.prisma.subscription.update({
        where: { id: restaurantSub.id },
        data: { userId, isBillingAnchor: true },
      });
    }
  }

  private getFallbackRestaurantLimit(planId: string): number {
    const limits: Record<string, number> = {
      STARTER: 1,
      PROFESSIONAL: 3,
      ENTERPRISE: 9999,
    };
    return limits[planId] ?? 1;
  }

  private async resolveAccountPlanId(userId: string): Promise<string> {
    const subscription = await this.subscriptionResolver.resolveForUser(
      userId,
      {
        select: { planId: true, planType: true },
      },
    );
    if (!subscription) return PlanType.STARTER;
    return (
      subscription.planId ||
      (subscription.planType as string) ||
      PlanType.STARTER
    );
  }
}
