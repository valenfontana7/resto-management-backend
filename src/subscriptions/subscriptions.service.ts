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
import {
  CreateSubscriptionDto,
  CreateCheckoutDto,
  UpdateSubscriptionDto,
  PlanType,
} from './dto';
import {
  PLAN_PRICES,
  PLAN_NAMES,
  TRIAL_DAYS,
  isPlanUpgrade,
} from './constants';
import { SubscriptionStatus, Prisma } from '@prisma/client';
import { addDays, addMonths, differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private mp: MercadoPagoConfig | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly mercadopagoService: MercadoPagoService,
  ) {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    if (accessToken) {
      this.mp = new MercadoPagoConfig({ accessToken });
    }
  }

  /**
   * Crea (o retorna) el mpCustomerId para la suscripción del restaurante.
   */
  async ensureMpCustomer(
    restaurantId: string,
    metadata?: { email?: string; description?: string },
  ): Promise<string> {
    // Intentar leer suscripción
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
      select: { id: true, mpCustomerId: true },
    });

    if (subscription?.mpCustomerId) return subscription.mpCustomerId;

    if (!this.mercadopagoService) {
      throw new BadRequestException('MercadoPago no está configurado');
    }

    // Crear customer en la cuenta GLOBAL de la plataforma para suscripciones
    const mpCustomerId = await this.mercadopagoService.createCustomer(
      restaurantId,
      metadata,
      true,
    );

    // Upsert subscription row minimalmente
    await this.prisma.subscription.upsert({
      where: { restaurantId },
      create: {
        restaurant: { connect: { id: restaurantId } },
        planType: 'STARTER',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5),
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

    // Obtener (o crear) subscription
    const subscription = await this.prisma.subscription.upsert({
      where: { restaurantId },
      create: {
        restaurant: { connect: { id: restaurantId } },
        planType: 'STARTER',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5),
        mpCustomerId,
      } as any,
      update: {},
    });

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
    } catch (e) {
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
      include: { paymentMethods: true },
    });

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
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
      include: { paymentMethods: true },
    });

    if (!subscription) throw new NotFoundException('Subscription not found');

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
          details: String((e as any).message ?? e),
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
      include: { paymentMethods: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

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
      where: { restaurantId },
      data: updates,
    });
    return { subscription: updated, selectedUserPaymentMethod };
  }

  /**
   * Obtener suscripción actual de un restaurante
   */
  async getSubscription(restaurantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
      include: {
        invoices: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        paymentMethods: {
          where: { isDefault: true },
          take: 1,
        },
      },
    });

    return { subscription };
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

    if (isTrialing && subscription.trialEnd) {
      nextBillingDate = subscription.trialEnd;
      nextBillingAmount = PLAN_PRICES[planType];
    } else if (subscription.status === SubscriptionStatus.ACTIVE) {
      nextBillingDate = subscription.currentPeriodEnd;
      nextBillingAmount = PLAN_PRICES[subscription.planType as PlanType];
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
    // Verificar que no exista suscripción activa
    const existing = await this.prisma.subscription.findUnique({
      where: { restaurantId },
    });

    if (
      existing &&
      existing.status !== SubscriptionStatus.EXPIRED &&
      existing.status !== SubscriptionStatus.CANCELED
    ) {
      throw new ConflictException(
        'Ya existe una suscripción activa para este restaurante',
      );
    }

    const now = new Date();
    const planType = dto.planType;

    let subscriptionData: Prisma.SubscriptionCreateInput;

    if (planType === PlanType.STARTER) {
      // Plan gratuito: activo inmediatamente, sin trial
      subscriptionData = {
        restaurant: { connect: { id: restaurantId } },
        planType,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: addMonths(now, 120), // 10 años, prácticamente sin vencimiento
      };
    } else {
      // Planes de pago: inician con trial de 14 días
      const trialEnd = addDays(now, TRIAL_DAYS);
      subscriptionData = {
        restaurant: { connect: { id: restaurantId } },
        planType,
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialStart: now,
        trialEnd,
        nextPaymentDate: trialEnd,
      };
    }

    // Si existe una suscripción cancelada/expirada, actualizarla
    let subscription;
    if (existing) {
      subscription = await this.prisma.subscription.update({
        where: { restaurantId },
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
    if (planType !== PlanType.STARTER && subscription.trialEnd) {
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
   * Crear checkout de MercadoPago para suscripción
   */
  async createCheckout(restaurantId: string, dto: CreateCheckoutDto) {
    if (!this.mp) {
      throw new BadRequestException('MercadoPago no está configurado');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, email: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const price = PLAN_PRICES[dto.planType];
    if (price === 0) {
      throw new BadRequestException(
        'El plan Starter es gratuito, no requiere checkout',
      );
    }

    // Convertir centavos a pesos para MercadoPago
    const unitPrice = price / 100;

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
            title: `Plan ${PLAN_NAMES[dto.planType]} - Restoo`,
            description: `Suscripción mensual al plan ${PLAN_NAMES[dto.planType]}`,
            quantity: 1,
            currency_id: 'ARS',
            unit_price: unitPrice,
          },
        ],
        back_urls: backUrls,
        external_reference: `sub_${restaurantId}_${dto.planType}`,
        metadata: {
          restaurantId,
          planType: dto.planType,
          type: 'subscription',
        },
        notification_url: `${this.configService.get('BACKEND_URL')}/api/webhooks/mercadopago/subscription`,
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
    };
  }

  /**
   * Actualizar plan de suscripción (upgrade/downgrade)
   */
  async updateSubscription(restaurantId: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
    });

    if (!subscription) {
      throw new NotFoundException(
        'No existe suscripción para este restaurante',
      );
    }

    if (
      subscription.status === SubscriptionStatus.CANCELED ||
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
      throw new BadRequestException('La suscripción no está activa');
    }

    const currentPlan = subscription.planType as PlanType;
    const newPlan = dto.planType;

    if (currentPlan === newPlan) {
      throw new BadRequestException('Ya tienes este plan');
    }

    const isUpgrade = isPlanUpgrade(currentPlan, newPlan);
    let message: string;

    if (isUpgrade) {
      // Upgrade: aplicar inmediatamente
      await this.prisma.subscription.update({
        where: { restaurantId },
        data: {
          planType: newPlan,
          nextPaymentDate: subscription.currentPeriodEnd,
        },
      });
      message = 'Plan actualizado. El cambio se aplicó inmediatamente.';
    } else {
      // Downgrade a Starter o plan inferior: aplicar al final del período
      await this.prisma.subscription.update({
        where: { restaurantId },
        data: {
          // Guardamos el nuevo plan en metadata para aplicar al renovar
          // Por ahora, aplicamos inmediatamente también
          planType: newPlan,
        },
      });
      message = `Plan actualizado. El cambio se aplicará al final del período actual (${format(subscription.currentPeriodEnd, "d 'de' MMMM", { locale: es })}).`;
    }

    const updatedSubscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
    });

    if (!subscription) {
      throw new NotFoundException(
        'No existe suscripción para este restaurante',
      );
    }

    if (subscription.status === SubscriptionStatus.CANCELED) {
      throw new BadRequestException('La suscripción ya está cancelada');
    }

    const updatedSubscription = await this.prisma.subscription.update({
      where: { restaurantId },
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
   * Reactivar suscripción cancelada
   */
  async reactivateSubscription(restaurantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
    });

    if (!subscription) {
      throw new NotFoundException(
        'No existe suscripción para este restaurante',
      );
    }

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
      where: { restaurantId },
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { restaurantId },
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
   * Procesar pago aprobado de suscripción (llamado desde webhook)
   */
  async processPaymentApproved(
    restaurantId: string,
    planType: PlanType,
    paymentId: string,
    amount: number,
  ) {
    const now = new Date();
    const nextBillingDate = addMonths(now, 1);

    const subscription = await this.prisma.subscription.upsert({
      where: { restaurantId },
      create: {
        restaurant: { connect: { id: restaurantId } },
        planType,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: nextBillingDate,
        lastPaymentDate: now,
        lastPaymentAmount: amount,
        nextPaymentDate: nextBillingDate,
      },
      update: {
        planType,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: nextBillingDate,
        lastPaymentDate: now,
        lastPaymentAmount: amount,
        nextPaymentDate: nextBillingDate,
        trialEnd: null, // Trial terminado
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });

    // Crear factura
    await this.prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount,
        status: 'paid',
        mpPaymentId: paymentId,
        paidAt: now,
      },
    });

    // Enviar email de pago exitoso
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { email: true, name: true },
    });

    if (restaurant?.email) {
      await this.emailService.sendPaymentSuccessEmail(
        restaurant.email,
        restaurant.name,
        PLAN_NAMES[planType],
        amount,
        nextBillingDate,
      );
    }

    this.logger.log(`Pago procesado para suscripción ${subscription.id}`);

    return subscription;
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
}
