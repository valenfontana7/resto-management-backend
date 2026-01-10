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
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiredTrials() {
    this.logger.log('Checking expired trials...');

    try {
      const expiredTrials = await this.subscriptionsService.getExpiredTrials();

      for (const subscription of expiredTrials) {
        try {
          // Si tiene método de pago, podríamos intentar cobrar automáticamente
          // Por ahora, simplemente marcamos como expirado y notificamos
          if (subscription.paymentMethodId) {
            // TODO: Implementar cobro automático con MercadoPago
            this.logger.log(
              `Subscription ${subscription.id} has payment method, would attempt charge`,
            );
          }

          // Marcar como expirado
          await this.subscriptionsService.markAsExpired(subscription.id);

          // Enviar email de trial expirado
          if (subscription.restaurant?.email) {
            const planName = PLAN_NAMES[subscription.planType as PlanType];
            await this.emailService.sendTrialExpiredEmail(
              subscription.restaurant.email,
              subscription.restaurant.name,
              planName,
            );
          }

          this.logger.log(`Trial expired for subscription ${subscription.id}`);
        } catch (error: any) {
          this.logger.error(
            `Error processing expired trial ${subscription.id}: ${error.message}`,
          );
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
   */
  @Cron('5 0 * * *') // 00:05 AM todos los días
  async processMonthlyRenewals() {
    this.logger.log('Processing monthly renewals...');

    try {
      const subscriptionsToRenew =
        await this.subscriptionsService.getSubscriptionsToRenew();

      for (const subscription of subscriptionsToRenew) {
        try {
          // Por ahora, marcamos como past_due y notificamos
          // TODO: Implementar cobro automático con MercadoPago
          await this.subscriptionsService.markAsPastDue(subscription.id);

          if (subscription.restaurant?.email) {
            const planType = subscription.planType as PlanType;
            const planName = PLAN_NAMES[planType];
            const amount = PLAN_PRICES[planType];

            await this.emailService.sendPaymentFailedEmail(
              subscription.restaurant.email,
              subscription.restaurant.name,
              planName,
              amount,
            );
          }

          this.logger.log(
            `Subscription ${subscription.id} marked as past_due, payment required`,
          );
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
