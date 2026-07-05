import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Resend } from 'resend';
import { EMAIL_QUEUE, type EmailJobData } from './email.processor';
import {
  STATUS_CONFIG,
  emailHighlightBox,
  formatPrice,
  renderNewOrderEmail,
  renderNotificationEmail,
  renderOrderConfirmationEmail,
  renderStatusUpdateEmail,
  renderSubscriptionEmail,
  subscriptionContentParagraph,
  subscriptionDataTable,
  subscriptionPlanChangeBox,
  type OrderData,
  type RestaurantData,
} from './email-templates';

export type { OrderData, RestaurantData };

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;
  private useQueue = false;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue: Queue<EmailJobData> | null,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY not configured - emails will be logged only',
      );
    }

    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') || 'pedidos@example.com';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    this.useQueue =
      !!this.configService.get<string>('REDIS_URL') && !!this.emailQueue;
  }

  private buildOrderTrackingUrl(
    order: OrderData,
    restaurant: RestaurantData,
  ): string {
    const token = order.publicTrackingToken
      ? `?token=${encodeURIComponent(order.publicTrackingToken)}`
      : '';
    const slug = (restaurant.slug || '').trim();
    const path = slug
      ? `/${encodeURIComponent(slug)}/order/${encodeURIComponent(order.id)}`
      : `/order/${encodeURIComponent(order.id)}`;
    return `${this.frontendUrl}${path}${token}`;
  }

  async sendOrderConfirmation(
    order: OrderData,
    restaurant: RestaurantData,
  ): Promise<boolean> {
    if (!order.customerEmail) {
      this.logger.warn(
        `Order ${order.orderNumber}: No customer email provided`,
      );
      return false;
    }

    const trackingUrl = this.buildOrderTrackingUrl(order, restaurant);
    const html = renderOrderConfirmationEmail(order, restaurant, trackingUrl);

    return this.sendEmail({
      from: `${restaurant.name} <${this.fromEmail}>`,
      to: order.customerEmail,
      subject: `Pedido confirmado · ${order.orderNumber}`,
      html,
    });
  }

  async sendNewOrderNotification(
    order: OrderData,
    restaurant: RestaurantData,
  ): Promise<boolean> {
    if (!restaurant.email) {
      this.logger.warn(
        `Restaurant ${restaurant.name}: No email configured for notifications`,
      );
      return false;
    }

    const html = renderNewOrderEmail(order, {
      name: restaurant.name,
      logoUrl: restaurant.logoUrl,
    });

    return this.sendEmail({
      from: `Pedidos Bentoo <${this.fromEmail}>`,
      to: restaurant.email,
      subject: `Nuevo pedido · #${order.orderNumber} · $${formatPrice(order.total)}`,
      html,
    });
  }

  async sendStatusUpdate(
    order: OrderData,
    restaurant: RestaurantData,
  ): Promise<boolean> {
    if (!order.customerEmail) {
      this.logger.warn(
        `Order ${order.orderNumber}: No customer email for status update`,
      );
      return false;
    }

    const config = STATUS_CONFIG[order.status];
    if (!config) {
      return false;
    }

    const trackingUrl = this.buildOrderTrackingUrl(order, restaurant);
    const html = renderStatusUpdateEmail(order, restaurant, trackingUrl);

    return this.sendEmail({
      from: `${restaurant.name} <${this.fromEmail}>`,
      to: order.customerEmail,
      subject: `${config.title} · Pedido #${order.orderNumber}`,
      html,
    });
  }

  async sendGenericEmail(
    to: string,
    subject: string,
    html: string,
    fromName?: string,
  ): Promise<boolean> {
    const from = fromName ? `${fromName} <${this.fromEmail}>` : this.fromEmail;
    return this.sendEmail({ from, to, subject, html });
  }

  async sendWinBackEmail(params: {
    to: string;
    customerName: string;
    restaurantName: string;
    menuUrl: string;
    logoUrl?: string | null;
    restaurantAddress?: string;
    restaurantPhone?: string;
    restaurantEmail?: string;
    couponCode?: string | null;
    couponPercent?: number | null;
  }): Promise<boolean> {
    const name = params.customerName.trim().split(/\s+/)[0] || 'Cliente';
    const couponBlock =
      params.couponCode && params.couponPercent
        ? subscriptionContentParagraph(
            `Usá el código <strong>${params.couponCode}</strong> y obtené ${params.couponPercent}% off en tu próximo pedido.`,
            true,
          )
        : subscriptionContentParagraph(
            `Tenemos novedades en el menú y te esperamos con la misma calidez de siempre.`,
            true,
          );
    const html = renderSubscriptionEmail({
      title: `Te extrañamos, ${name}`,
      subtitle: 'Será un placer recibirte de nuevo',
      accent: '#B45309',
      restaurant: {
        name: params.restaurantName,
        logoUrl: params.logoUrl,
        address: params.restaurantAddress ?? '',
        phone: params.restaurantPhone ?? '',
        email: params.restaurantEmail ?? '',
      },
      content: `
        ${subscriptionContentParagraph(`Hace un tiempo que no nos visitás y queríamos saludarte.`)}
        ${couponBlock}
      `,
      ctaText: params.couponCode ? 'Pedir con descuento' : 'Ver menú y pedir',
      ctaUrl: params.menuUrl,
    });

    return this.sendEmail({
      from: `${params.restaurantName} <${this.fromEmail}>`,
      to: params.to,
      subject: `${params.restaurantName} te extraña — volvé cuando quieras`,
      html,
    });
  }

  private async sendEmail(params: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    if (this.useQueue) {
      try {
        await this.emailQueue!.add('send', params, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        });
        this.logger.log(`Email queued for ${params.to}: ${params.subject}`);
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to queue email, sending directly: ${message}`);
      }
    }

    if (!this.resend) {
      this.logger.log(
        `[EMAIL MOCK] To: ${params.to} | Subject: ${params.subject}`,
      );
      return true;
    }

    try {
      const result = await this.resend.emails.send({
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      if (result.error) {
        this.logger.error(`Failed to send email: ${result.error.message}`);
        return false;
      }

      this.logger.log(
        `Email sent successfully to ${params.to}: ${result.data?.id}`,
      );
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error sending email: ${message}`);
      return false;
    }
  }

  async sendWelcomeTrialEmail(
    email: string,
    restaurantName: string,
    planName: string,
    trialEndDate: Date,
  ): Promise<boolean> {
    const formattedDate = this.formatDate(trialEndDate);
    const html = renderSubscriptionEmail({
      title: 'Bienvenido a Bentoo',
      subtitle: `Tu prueba de ${planName} ya está activa`,
      content: `
        ${subscriptionContentParagraph(
          `Gracias por confiar en <strong>Bentoo</strong> para hacer crecer <strong>${restaurantName}</strong>.`,
        )}
        ${subscriptionContentParagraph(
          `Tu período de prueba gratuito de <strong>14 días</strong> del plan <strong>${planName}</strong> comenzó. Durante este tiempo, podés explorar todas las herramientas sin compromiso.`,
          true,
        )}
        ${emailHighlightBox(
          `<strong>Tu prueba termina el ${formattedDate}.</strong><br>Hasta entonces, disfrutá de todas las funcionalidades incluidas en tu plan.`,
          'success',
        )}
        ${subscriptionContentParagraph(
          `Si necesitás una mano para configurar tu local, estamos a un mensaje de distancia.`,
          true,
        )}
      `,
      ctaText: 'Ir al panel',
      ctaUrl: `${this.frontendUrl}/admin`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Bienvenido a Bentoo · Prueba de ${planName} activa`,
      html,
    });
  }

  async sendTrialEndingEmail(
    email: string,
    restaurantName: string,
    planName: string,
    daysRemaining: number,
    amount: number,
  ): Promise<boolean> {
    const dayText = daysRemaining === 1 ? 'día' : 'días';
    const formattedAmount = formatPrice(amount / 100);

    const html = renderSubscriptionEmail({
      title: `Tu prueba termina en ${daysRemaining} ${dayText}`,
      subtitle: 'Continuá sin interrupciones cuando quieras',
      accent: daysRemaining === 1 ? '#B91C1C' : '#B45309',
      content: `
        ${subscriptionContentParagraph(
          `La prueba de <strong>${restaurantName}</strong> en el plan <strong>${planName}</strong> está por finalizar.`,
        )}
        ${emailHighlightBox(
          `Quedan <strong>${daysRemaining} ${dayText}</strong> de acceso completo. Después, tu cuenta pasará al plan Starter gratuito si no agregás un método de pago.`,
          'warning',
        )}
        ${subscriptionContentParagraph(
          `El plan ${planName} tiene un costo de <strong>$${formattedAmount}/mes</strong>. Podés suscribirte en cualquier momento desde el panel.`,
          true,
        )}
      `,
      ctaText: 'Agregar método de pago',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Tu prueba de ${planName} termina en ${daysRemaining} ${dayText}`,
      html,
    });
  }

  async sendTrialExpiredEmail(
    email: string,
    restaurantName: string,
    planName: string,
  ): Promise<boolean> {
    const html = renderSubscriptionEmail({
      title: 'Tu período de prueba finalizó',
      subtitle: 'Tus datos siguen seguros',
      content: `
        ${subscriptionContentParagraph(
          `La prueba del plan <strong>${planName}</strong> para <strong>${restaurantName}</strong> llegó a su fin.`,
        )}
        ${emailHighlightBox(
          'Ya no tenés acceso a las funcionalidades premium, pero podés volver cuando quieras.',
          'neutral',
        )}
        ${subscriptionContentParagraph(
          `Mientras tanto, seguís pudiendo usar el plan <strong>Starter</strong> sin costo.`,
          true,
        )}
      `,
      ctaText: 'Ver planes disponibles',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Prueba finalizada · ${restaurantName}`,
      html,
    });
  }

  async sendPaymentSuccessEmail(
    email: string,
    restaurantName: string,
    planName: string,
    amount: number,
    nextBillingDate: Date,
  ): Promise<boolean> {
    const formattedAmount = formatPrice(amount / 100);
    const formattedDate = this.formatDate(nextBillingDate);

    const html = renderSubscriptionEmail({
      title: 'Pago confirmado',
      subtitle: `Tu suscripción a ${planName} está activa`,
      content: `
        ${subscriptionContentParagraph(
          `Recibimos tu pago correctamente. Gracias por seguir confiando en Bentoo para <strong>${restaurantName}</strong>.`,
        )}
        ${subscriptionDataTable([
          ['Plan', planName],
          ['Monto', `$${formattedAmount}`],
          ['Próxima facturación', formattedDate],
        ])}
        ${subscriptionContentParagraph(
          'Podés ver el historial y gestionar tu suscripción desde el panel.',
          true,
        )}
      `,
      ctaText: 'Ver mi suscripción',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Pago confirmado · Plan ${planName}`,
      html,
    });
  }

  async sendPaymentFailedEmail(
    email: string,
    restaurantName: string,
    planName: string,
    amount: number,
  ): Promise<boolean> {
    const formattedAmount = formatPrice(amount / 100);

    const html = renderSubscriptionEmail({
      title: 'No pudimos procesar tu pago',
      subtitle: 'Actualizá tu método de pago para continuar',
      accent: '#B91C1C',
      content: `
        ${subscriptionContentParagraph(
          `Hubo un inconveniente al cobrar <strong>$${formattedAmount}</strong> de la suscripción de <strong>${restaurantName}</strong>.`,
        )}
        ${emailHighlightBox(
          '<strong>Tu suscripción está en riesgo.</strong> Tenés 3 días para actualizar el método de pago antes de perder el acceso premium.',
          'danger',
        )}
        ${subscriptionContentParagraph(
          'Verificá que tu tarjeta tenga fondos suficientes o agregá un nuevo método de pago.',
          true,
        )}
      `,
      ctaText: 'Actualizar método de pago',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Acción requerida · Pago de ${planName}`,
      html,
    });
  }

  async sendSubscriptionCanceledEmail(
    email: string,
    restaurantName: string,
    planName: string,
    accessEndDate: Date,
  ): Promise<boolean> {
    const formattedDate = this.formatDate(accessEndDate);

    const html = renderSubscriptionEmail({
      title: 'Suscripción cancelada',
      subtitle: 'Esperamos verte de nuevo pronto',
      content: `
        ${subscriptionContentParagraph(
          `Confirmamos la cancelación del plan <strong>${planName}</strong> para <strong>${restaurantName}</strong>.`,
        )}
        ${emailHighlightBox(
          `<strong>Conservás acceso hasta el ${formattedDate}.</strong> Después, tu cuenta pasará al plan Starter gratuito.`,
          'neutral',
        )}
        ${subscriptionContentParagraph(
          'Si cambiás de opinión, podés reactivar tu suscripción en cualquier momento antes de esa fecha.',
          true,
        )}
      `,
      ctaText: 'Reactivar suscripción',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Suscripción cancelada · ${restaurantName}`,
      html,
    });
  }

  async sendSubscriptionReactivatedEmail(
    email: string,
    restaurantName: string,
    planName: string,
  ): Promise<boolean> {
    const html = renderSubscriptionEmail({
      title: 'Bienvenido de nuevo',
      subtitle: `Tu plan ${planName} está activo otra vez`,
      content: `
        ${subscriptionContentParagraph(
          `Reactivamos la suscripción al plan <strong>${planName}</strong> para <strong>${restaurantName}</strong>.`,
        )}
        ${emailHighlightBox(
          'Todas tus funcionalidades premium ya están disponibles.',
          'success',
        )}
        ${subscriptionContentParagraph(
          'Gracias por seguir confiando en nosotros. Estamos acá para acompañarte.',
          true,
        )}
      `,
      ctaText: 'Ir al panel',
      ctaUrl: `${this.frontendUrl}/admin`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Suscripción reactivada · ${restaurantName}`,
      html,
    });
  }

  async sendPlanUpgradedEmail(
    email: string,
    restaurantName: string,
    oldPlanName: string,
    newPlanName: string,
  ): Promise<boolean> {
    const html = renderSubscriptionEmail({
      title: 'Plan actualizado',
      subtitle: `Ahora tenés acceso a ${newPlanName}`,
      content: `
        ${subscriptionContentParagraph(
          `Actualizaste el plan de <strong>${restaurantName}</strong>. ¡Felicitaciones por dar este paso!`,
        )}
        ${subscriptionPlanChangeBox(oldPlanName, newPlanName)}
        ${subscriptionContentParagraph(
          'Las nuevas funcionalidades ya están disponibles en tu panel.',
          true,
        )}
      `,
      ctaText: 'Explorar el panel',
      ctaUrl: `${this.frontendUrl}/admin`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Plan actualizado a ${newPlanName} · ${restaurantName}`,
      html,
    });
  }

  async sendPlanDowngradedEmail(
    email: string,
    restaurantName: string,
    oldPlanName: string,
    newPlanName: string,
    effectiveDate: Date,
  ): Promise<boolean> {
    const formattedDate = this.formatDate(effectiveDate);

    const html = renderSubscriptionEmail({
      title: 'Cambio de plan confirmado',
      subtitle: `Tu plan pasará a ${newPlanName}`,
      content: `
        ${subscriptionContentParagraph(
          `Confirmamos el cambio de plan para <strong>${restaurantName}</strong>.`,
        )}
        ${subscriptionDataTable([
          ['Plan actual', oldPlanName],
          ['Nuevo plan', newPlanName],
          ['Fecha de cambio', formattedDate],
        ])}
        ${subscriptionContentParagraph(
          `Hasta el ${formattedDate}, seguís teniendo acceso a las funciones de ${oldPlanName}.`,
          true,
        )}
      `,
      ctaText: 'Ver mi suscripción',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to: email,
      subject: `Cambio de plan programado · ${restaurantName}`,
      html,
    });
  }

  async sendNotificationEmail(
    to: string,
    subject: string,
    title: string,
    message: string,
    data?: unknown,
  ): Promise<boolean> {
    const html = renderNotificationEmail(title, message, data);

    return this.sendEmail({
      from: `Bentoo <${this.fromEmail}>`,
      to,
      subject,
      html,
    });
  }

  /**
   * Email CS post-venta (Customer Engagement Engine).
   * Usa Resend/BullMQ cuando está configurado; si no, log mock.
   */
  async sendCustomerEngagementEmail(params: {
    to: string;
    subject: string;
    html: string;
    deliveryId: string;
  }): Promise<{ ok: boolean; simulated: boolean; providerId?: string }> {
    if (!this.resend) {
      this.logger.log(
        `[EMAIL MOCK] CS engagement ${params.deliveryId} → ${params.to}`,
      );
      return { ok: true, simulated: true };
    }

    try {
      const result = await this.resend.emails.send({
        from: `Bentoo <${this.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        tags: [
          { name: 'engagement_delivery_id', value: params.deliveryId },
          { name: 'source', value: 'customer_engagement' },
        ],
      });

      if (result.error) {
        this.logger.error(
          `CS engagement email failed: ${result.error.message}`,
        );
        return { ok: false, simulated: false };
      }

      return {
        ok: true,
        simulated: false,
        providerId: result.data?.id,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`CS engagement email error: ${message}`);
      return { ok: false, simulated: false };
    }
  }

  /**
   * Email Lifecycle Marketing Engine.
   */
  async sendLifecycleMarketingEmail(params: {
    to: string;
    subject: string;
    html: string;
    deliveryId: string;
  }): Promise<{ ok: boolean; simulated: boolean; providerId?: string }> {
    if (!this.resend) {
      this.logger.log(
        `[EMAIL MOCK] Lifecycle marketing ${params.deliveryId} → ${params.to}`,
      );
      return { ok: true, simulated: true };
    }

    try {
      const result = await this.resend.emails.send({
        from: `Bentoo <${this.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        tags: [
          { name: 'lifecycle_delivery_id', value: params.deliveryId },
          { name: 'source', value: 'lifecycle_marketing' },
        ],
      });

      if (result.error) {
        this.logger.error(
          `Lifecycle marketing email failed: ${result.error.message}`,
        );
        return { ok: false, simulated: false };
      }

      return {
        ok: true,
        simulated: false,
        providerId: result.data?.id,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Lifecycle marketing email error: ${message}`);
      return { ok: false, simulated: false };
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
