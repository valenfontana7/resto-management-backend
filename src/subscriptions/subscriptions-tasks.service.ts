import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionsService } from './subscriptions.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { differenceInDays } from 'date-fns';
import { PlanType } from './dto';
import { PLAN_PRICES, PLAN_NAMES } from './constants';

@Injectable()
export class SubscriptionTasksService {
  private readonly logger = new Logger(SubscriptionTasksService.name);

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verificar trials expirados - cada hora
   * Implementa bloqueo optimista para evitar cobros duplicados en entornos multi-instancia
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiredTrials() {
    this.logger.log('Checking expired trials...');

    try {
      // Obtener trials expirados con su método de pago por defecto (si existe)
      // Solo traer los que NO tienen un cargo pendiente o reciente (evitar race condition)
      const expiredTrials = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.TRIALING,
          trialEnd: { lt: new Date() },
        },
        include: {
          restaurant: { select: { id: true, name: true, email: true } },
          paymentMethods: { where: { isDefault: true }, take: 1 },
        },
      });

      for (const subscription of expiredTrials) {
        try {
          // Bloqueo optimista: intentar marcar como PROCESSING antes de cobrar
          // Esto evita que múltiples instancias del cron cobren la misma suscripción
          const lockResult = await this.prisma.subscription.updateMany({
            where: {
              id: subscription.id,
              status: SubscriptionStatus.TRIALING, // Solo si sigue en TRIALING
            },
            data: {
              // Usamos PAST_DUE temporalmente como estado de "procesando"
              status: SubscriptionStatus.PAST_DUE,
            },
          });

          // Si no se actualizó, otra instancia ya lo está procesando
          if (lockResult.count === 0) {
            this.logger.log(
              `Subscription ${subscription.id} already being processed by another instance`,
            );
            continue;
          }

          const pm = (subscription as any).paymentMethods?.[0];

          if (pm && subscription.mpCustomerId) {
            // Intentar cobrar hasta 3 veces
            const planType = subscription.planType as PlanType;
            const amount = PLAN_PRICES[planType] ?? 0;

            // Validar monto antes de intentar cobrar
            if (amount <= 0) {
              this.logger.warn(
                `Skipping charge for ${subscription.id}: plan ${planType} has no price`,
              );
              // Activar directamente si es plan gratuito
              await this.subscriptionsService.processPaymentApproved(
                subscription.restaurant?.id ?? '',
                planType,
                'free_plan_activation',
                0,
              );
              continue;
            }

            let paid = false;
            let lastError: any = null;

            // Generar clave de idempotencia única para este ciclo de cobro
            const today = new Date().toISOString().split('T')[0];
            const idempotencyKey = `trial_charge_${subscription.id}_${today}`;

            for (let attempt = 1; attempt <= 3 && !paid; attempt++) {
              try {
                this.logger.log(
                  `Attempting charge for subscription ${subscription.id} (attempt ${attempt}), amount: ${amount} cents`,
                );

                const mercadopagoService = (this.subscriptionsService as any)
                  .mercadopagoService;
                if (!mercadopagoService) {
                  throw new Error('MercadoPago service not available');
                }

                const resp = await mercadopagoService.chargeWithSavedCard(
                  subscription.restaurant?.id ?? '',
                  subscription.mpCustomerId,
                  pm.mpCardId,
                  amount, // Ya está en centavos, chargeWithSavedCard lo convierte
                  'ARS',
                  `Suscripción ${PLAN_NAMES[planType]} - Restoo`,
                  true,
                  `${idempotencyKey}_attempt_${attempt}`,
                );

                // chargeWithSavedCard ahora valida que status === 'approved'
                const paymentId = resp.id;
                if (paymentId) {
                  // registrar pago usando processPaymentApproved
                  await this.subscriptionsService.processPaymentApproved(
                    subscription.restaurant?.id ?? '',
                    subscription.planType as PlanType,
                    paymentId,
                    amount,
                  );
                  paid = true;
                  this.logger.log(
                    `Charge successful for subscription ${subscription.id}, payment ${paymentId}`,
                  );
                }
              } catch (err: any) {
                lastError = err;
                this.logger.warn(
                  `Charge attempt ${attempt} failed for subscription ${subscription.id}: ${err?.message ?? err}`,
                );
                // Delay exponencial entre intentos
                await new Promise((res) =>
                  setTimeout(res, 2000 * Math.pow(2, attempt - 1)),
                );
              }
            }

            if (!paid) {
              // marcar como expirado y notificar
              this.logger.warn(
                `All charge attempts failed for ${subscription.id}: ${lastError?.message}`,
              );
              await this.subscriptionsService.markAsExpired(subscription.id);
              if (subscription.restaurant?.email) {
                const planName = PLAN_NAMES[subscription.planType as PlanType];
                await this.emailService.sendPaymentFailedEmail(
                  subscription.restaurant.email,
                  subscription.restaurant.name,
                  planName,
                  amount,
                );
              }
            }
          } else {
            // No hay método de pago: marcar expirado y notificar
            await this.subscriptionsService.markAsExpired(subscription.id);
            if (subscription.restaurant?.email) {
              const planName = PLAN_NAMES[subscription.planType as PlanType];
              await this.emailService.sendTrialExpiredEmail(
                subscription.restaurant.email,
                subscription.restaurant.name,
                planName,
              );
            }
          }
        } catch (error: any) {
          this.logger.error(
            `Error processing expired trial ${subscription.id}: ${error.message}`,
          );
          // Revertir estado a TRIALING si hubo error inesperado
          try {
            await this.prisma.subscription.update({
              where: { id: subscription.id },
              data: { status: SubscriptionStatus.TRIALING },
            });
          } catch (revertError) {
            this.logger.error(
              `Failed to revert status for ${subscription.id}: ${revertError}`,
            );
          }
        }
      }

      this.logger.log(`Processed ${expiredTrials.length} expired trials`);
    } catch (error: any) {
      this.logger.error(`Error checking expired trials: ${error.message}`);
    }
  }

  /**
   * Enviar avisos de trial por expirar - cada día a las 10:00
   */
  @Cron('0 10 * * *') // 10:00 AM todos los días
  async sendTrialExpiringReminders() {
    this.logger.log('Sending trial expiring reminders...');

    try {
      const now = new Date();

      // Buscar suscripciones en trial
      const trialingSubs = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.TRIALING,
          trialEnd: { gt: now },
        },
        include: {
          restaurant: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      for (const subscription of trialingSubs) {
        if (!subscription.trialEnd || !subscription.restaurant?.email) continue;

        const daysRemaining = differenceInDays(subscription.trialEnd, now);
        const planType = subscription.planType as PlanType;
        const planName = PLAN_NAMES[planType];
        const amount = PLAN_PRICES[planType];

        // Enviar aviso 3 días antes
        if (daysRemaining === 3) {
          await this.emailService.sendTrialEndingEmail(
            subscription.restaurant.email,
            subscription.restaurant.name,
            planName,
            3,
            amount,
          );
          this.logger.log(
            `Sent 3-day trial reminder for ${subscription.restaurant.name}`,
          );
        }

        // Enviar aviso 1 día antes
        if (daysRemaining === 1) {
          await this.emailService.sendTrialEndingEmail(
            subscription.restaurant.email,
            subscription.restaurant.name,
            planName,
            1,
            amount,
          );
          this.logger.log(
            `Sent 1-day trial reminder for ${subscription.restaurant.name}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(`Error sending trial reminders: ${error.message}`);
    }
  }

  /**
   * Procesar renovaciones mensuales - cada día a las 00:05
   * Implementa cobro automático con MercadoPago y bloqueo optimista
   */
  @Cron('5 0 * * *') // 00:05 AM todos los días
  async processMonthlyRenewals() {
    this.logger.log('Processing monthly renewals...');

    try {
      const subscriptionsToRenew =
        await this.subscriptionsService.getSubscriptionsToRenew();

      for (const subscription of subscriptionsToRenew) {
        try {
          // Bloqueo optimista: marcar como PAST_DUE antes de procesar
          const lockResult = await this.prisma.subscription.updateMany({
            where: {
              id: subscription.id,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodEnd: { lte: new Date() },
            },
            data: {
              status: SubscriptionStatus.PAST_DUE,
            },
          });

          if (lockResult.count === 0) {
            this.logger.log(
              `Subscription ${subscription.id} already being processed`,
            );
            continue;
          }

          // Obtener método de pago por defecto
          const paymentMethod =
            await this.prisma.subscriptionPaymentMethod.findFirst({
              where: {
                subscriptionId: subscription.id,
                isDefault: true,
              },
            });

          const planType = subscription.planType as PlanType;
          const amount = PLAN_PRICES[planType];

          // Si no hay método de pago o es plan gratuito, solo notificar
          if (!paymentMethod || !subscription.mpCustomerId || amount <= 0) {
            if (amount > 0) {
              // Solo notificar si es plan de pago sin método
              if (subscription.restaurant?.email) {
                const planName = PLAN_NAMES[planType];
                await this.emailService.sendPaymentFailedEmail(
                  subscription.restaurant.email,
                  subscription.restaurant.name,
                  planName,
                  amount,
                );
              }
              this.logger.log(
                `Subscription ${subscription.id} has no payment method, notification sent`,
              );
            } else {
              // Plan gratuito: renovar automáticamente
              await this.subscriptionsService.processPaymentApproved(
                subscription.restaurant?.id ?? '',
                planType,
                'free_plan_renewal',
                0,
              );
            }
            continue;
          }

          // Intentar cobro automático
          const today = new Date().toISOString().split('T')[0];
          const idempotencyKey = `renewal_${subscription.id}_${today}`;
          let paid = false;
          let lastError: any = null;

          for (let attempt = 1; attempt <= 3 && !paid; attempt++) {
            try {
              this.logger.log(
                `Attempting renewal charge for ${subscription.id} (attempt ${attempt})`,
              );

              const mercadopagoService = (this.subscriptionsService as any)
                .mercadopagoService;
              if (!mercadopagoService) {
                throw new Error('MercadoPago service not available');
              }

              const resp = await mercadopagoService.chargeWithSavedCard(
                subscription.restaurant?.id ?? '',
                subscription.mpCustomerId,
                paymentMethod.mpCardId,
                amount,
                'ARS',
                `Renovación ${PLAN_NAMES[planType]} - Restoo`,
                true,
                `${idempotencyKey}_attempt_${attempt}`,
              );

              // Pago exitoso
              await this.subscriptionsService.processPaymentApproved(
                subscription.restaurant?.id ?? '',
                planType,
                resp.id,
                amount,
              );
              paid = true;
              this.logger.log(
                `Renewal successful for ${subscription.id}, payment ${resp.id}`,
              );
            } catch (err: any) {
              lastError = err;
              this.logger.warn(
                `Renewal attempt ${attempt} failed for ${subscription.id}: ${err?.message}`,
              );
              await new Promise((res) =>
                setTimeout(res, 2000 * Math.pow(2, attempt - 1)),
              );
            }
          }

          if (!paid) {
            // Cobro fallido: mantener PAST_DUE y notificar
            this.logger.warn(
              `All renewal attempts failed for ${subscription.id}: ${lastError?.message}`,
            );
            if (subscription.restaurant?.email) {
              const planName = PLAN_NAMES[planType];
              await this.emailService.sendPaymentFailedEmail(
                subscription.restaurant.email,
                subscription.restaurant.name,
                planName,
                amount,
              );
            }
          }
        } catch (error: any) {
          this.logger.error(
            `Error processing renewal ${subscription.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(`Processed ${subscriptionsToRenew.length} renewals`);
    } catch (error: any) {
      this.logger.error(`Error processing renewals: ${error.message}`);
    }
  }

  /**
   * Finalizar suscripciones canceladas - cada día a las 00:10
   */
  @Cron('10 0 * * *') // 00:10 AM todos los días
  async finalizeCanceledSubscriptions() {
    this.logger.log('Finalizing canceled subscriptions...');

    try {
      const subsToFinalize =
        await this.subscriptionsService.getCanceledSubscriptionsToFinalize();

      for (const subscription of subsToFinalize) {
        await this.subscriptionsService.finalizeSubscription(subscription.id);
        this.logger.log(`Finalized subscription ${subscription.id}`);
      }

      this.logger.log(`Finalized ${subsToFinalize.length} subscriptions`);
    } catch (error: any) {
      this.logger.error(`Error finalizing subscriptions: ${error.message}`);
    }
  }
}
