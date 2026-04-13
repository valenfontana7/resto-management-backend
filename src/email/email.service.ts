import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Resend } from 'resend';
import { EMAIL_QUEUE, type EmailJobData } from './email.processor';

export interface OrderData {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  type: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  tip: number;
  total: number;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  publicTrackingToken?: string | null;
  notes?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    notes?: string | null;
  }>;
}

export interface RestaurantData {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

// Status configuration with colors and messages
const STATUS_CONFIG: Record<
  string,
  {
    emoji: string;
    title: string;
    subtitle: string;
    color: string;
    bgColor: string;
    step: number;
    customerMessage: string;
    actionTip: string;
  }
> = {
  PENDING: {
    emoji: '⏳',
    title: 'Esperando pago',
    subtitle: 'Tu pedido está pendiente de pago',
    color: '#f59e0b',
    bgColor: '#fef3c7',
    step: 1,
    customerMessage:
      'Estamos esperando la confirmación de tu pago para procesar tu pedido.',
    actionTip:
      '💡 Si ya realizaste el pago, aguardá unos minutos mientras lo verificamos.',
  },
  PAID: {
    emoji: '💳',
    title: '¡Pago confirmado!',
    subtitle: 'Tu pago se procesó correctamente',
    color: '#10b981',
    bgColor: '#d1fae5',
    step: 2,
    customerMessage:
      'Recibimos tu pago exitosamente. El restaurante recibirá tu pedido en instantes.',
    actionTip: '💡 Te notificaremos cuando el restaurante confirme tu pedido.',
  },
  CONFIRMED: {
    emoji: '👨‍🍳',
    title: 'Pedido confirmado',
    subtitle: 'El restaurante recibió tu pedido',
    color: '#3b82f6',
    bgColor: '#dbeafe',
    step: 3,
    customerMessage:
      'El restaurante confirmó tu pedido y pronto comenzará a prepararlo.',
    actionTip:
      '💡 El tiempo estimado de preparación depende del volumen de pedidos.',
  },
  PREPARING: {
    emoji: '🔥',
    title: '¡En preparación!',
    subtitle: 'Estamos cocinando tu pedido',
    color: '#f97316',
    bgColor: '#ffedd5',
    step: 4,
    customerMessage:
      '¡Nuestros cocineros están preparando tu pedido con el mayor cuidado!',
    actionTip: '💡 Pronto estará listo. Te avisaremos cuando esté terminado.',
  },
  READY: {
    emoji: '✅',
    title: '¡Pedido listo!',
    subtitle: 'Tu pedido está listo para entregar',
    color: '#22c55e',
    bgColor: '#dcfce7',
    step: 5,
    customerMessage: '¡Tu pedido está listo y esperándote!',
    actionTip:
      '💡 Si es delivery, el repartidor está en camino. Si es retiro, acercate al local.',
  },
  DELIVERED: {
    emoji: '🎉',
    title: '¡Entregado!',
    subtitle: '¡Gracias por tu compra!',
    color: '#8b5cf6',
    bgColor: '#ede9fe',
    step: 6,
    customerMessage:
      '¡Esperamos que disfrutes tu pedido! Gracias por elegirnos.',
    actionTip: '💜 Si te gustó, contales a tus amigos. ¡Nos ayuda mucho!',
  },
  CANCELLED: {
    emoji: '❌',
    title: 'Pedido cancelado',
    subtitle: 'Tu pedido ha sido cancelado',
    color: '#ef4444',
    bgColor: '#fee2e2',
    step: -1,
    customerMessage: 'Lamentamos informarte que tu pedido ha sido cancelado.',
    actionTip: '📞 Si tenés dudas, contactanos y te ayudaremos.',
  },
};

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

    // Queue is enabled if Redis is available and queue was injected
    this.useQueue =
      !!this.configService.get<string>('REDIS_URL') && !!this.emailQueue;
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

    const trackingUrl = `${this.frontendUrl}/order/${order.id}?token=${order.publicTrackingToken}`;
    const html = this.renderOrderConfirmationEmail(
      order,
      restaurant,
      trackingUrl,
    );

    return this.sendEmail({
      from: `${restaurant.name} <${this.fromEmail}>`,
      to: order.customerEmail,
      subject: `✅ ¡Pedido confirmado! - ${order.orderNumber}`,
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

    const html = this.renderNewOrderEmail(order, restaurant);

    return this.sendEmail({
      from: `Sistema de Pedidos <${this.fromEmail}>`,
      to: restaurant.email,
      subject: `🔔 Nuevo pedido #${order.orderNumber} - $${this.formatPrice(order.total)}`,
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

    const trackingUrl = `${this.frontendUrl}/order/${order.id}?token=${order.publicTrackingToken}`;
    const html = this.renderStatusUpdateEmail(order, restaurant, trackingUrl);

    return this.sendEmail({
      from: `${restaurant.name} <${this.fromEmail}>`,
      to: order.customerEmail,
      subject: `${config.emoji} ${config.title} - Pedido #${order.orderNumber}`,
      html,
    });
  }

  /**
   * Send a generic email (used by digest, notifications, etc.)
   */
  async sendGenericEmail(
    to: string,
    subject: string,
    html: string,
    fromName?: string,
  ): Promise<boolean> {
    const from = fromName ? `${fromName} <${this.fromEmail}>` : this.fromEmail;
    return this.sendEmail({ from, to, subject, html });
  }

  private async sendEmail(params: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    // If queue is available, enqueue with retry instead of sending directly
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
        // Fall through to direct send
      }
    }

    // Direct send (no Redis or queue failure)
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

  // ─────────────────────────────────────────────────────────────
  // Base Styles (shared across all templates)
  // ─────────────────────────────────────────────────────────────

  private getBaseStyles(): string {
    return `
      <style>
        /* Reset & Base */
        body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background-color: #f8fafc;
          color: #1e293b;
          line-height: 1.6;
        }
        
        /* Links */
        a { color: #10b981; text-decoration: none; }
        a:hover { text-decoration: underline; }
        
        /* Buttons */
        .btn-primary {
          display: inline-block;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 18px 40px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        /* Cards */
        .card {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        
        /* Responsive */
        @media screen and (max-width: 600px) {
          .email-wrapper { padding: 16px !important; }
          .email-content { padding: 24px !important; }
          .email-header { padding: 32px 24px !important; }
          .email-header h1 { font-size: 22px !important; }
          .btn-primary { padding: 16px 28px !important; font-size: 15px !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
          .order-item-row { display: block !important; }
          .order-item-price { text-align: left !important; padding-top: 8px !important; }
          .progress-step { width: 50% !important; margin-bottom: 16px !important; }
          .hide-mobile { display: none !important; }
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .email-body { background-color: #1e293b !important; }
          .email-card { background-color: #334155 !important; }
          .text-primary { color: #f1f5f9 !important; }
          .text-secondary { color: #cbd5e1 !important; }
        }
      </style>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // Order Confirmation Email (Customer)
  // ─────────────────────────────────────────────────────────────

  private renderOrderConfirmationEmail(
    order: OrderData,
    restaurant: RestaurantData,
    trackingUrl: string,
  ): string {
    const orderTime = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const orderDate = new Date().toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    const itemsHtml = order.items
      .map(
        (item) => `
        <tr class="order-item-row">
          <td style="padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="vertical-align: top;">
                  <div style="display: flex; align-items: flex-start;">
                    <span style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 4px 10px; border-radius: 8px; font-size: 13px; font-weight: 700; min-width: 28px; text-align: center;">${item.quantity}</span>
                    <div style="margin-left: 12px;">
                      <p style="margin: 0; font-weight: 600; color: #1e293b; font-size: 15px; line-height: 1.4;">${item.name}</p>
                      ${item.notes ? `<p style="margin: 6px 0 0; font-size: 13px; color: #64748b; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #10b981;">📝 ${item.notes}</p>` : ''}
                    </div>
                  </div>
                </td>
                <td class="order-item-price" style="text-align: right; font-weight: 600; color: #1e293b; white-space: nowrap; vertical-align: top; padding-left: 16px;">
                  $${this.formatPrice(item.unitPrice * item.quantity)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `,
      )
      .join('');

    const deliveryTypeHtml = this.getDeliveryTypeHtml(order);
    const estimatedTime = this.getEstimatedTime(order);

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Pedido Confirmado - ${order.orderNumber}</title>
  ${this.getBaseStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td class="email-wrapper" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
          
          <!-- Header con gradiente mejorado -->
          <tr>
            <td class="email-header" style="background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%); padding: 52px 40px; text-align: center;">
              <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 44px; line-height: 80px;">✅</span>
              </div>
              <h1 style="margin: 0 0 8px; font-size: 30px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">¡Pedido Confirmado!</h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: rgba(255,255,255,0.9);">Tu pago se procesó exitosamente</p>
              <div style="background: rgba(255,255,255,0.25); backdrop-filter: blur(10px); display: inline-block; padding: 12px 28px; border-radius: 50px; border: 1px solid rgba(255,255,255,0.3);">
                <span style="color: white; font-weight: 700; font-size: 18px; letter-spacing: 0.5px;">🧾 Pedido #${order.orderNumber}</span>
              </div>
            </td>
          </tr>
          
          <!-- Barra de tiempo -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="background: linear-gradient(90deg, #f0fdf4, #dcfce7); margin-top: -20px; border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #bbf7d0;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="color: #166534; font-size: 14px;">
                      📅 <strong>${orderDate}</strong> a las <strong>${orderTime}</strong>
                    </td>
                    ${estimatedTime ? `<td style="text-align: right; color: #166534; font-size: 14px;">⏱️ <strong>${estimatedTime}</strong></td>` : ''}
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="email-content" style="padding: 36px 40px 40px;">
              
              <!-- Saludo personalizado -->
              <div style="margin-bottom: 28px;">
                <p style="font-size: 18px; color: #1e293b; margin: 0 0 8px;">
                  ¡Hola <strong>${order.customerName}</strong>! 👋
                </p>
                <p style="font-size: 15px; color: #64748b; margin: 0; line-height: 1.7;">
                  Gracias por tu pedido en <strong style="color: #1e293b;">${restaurant.name}</strong>. 
                  Te mantendremos informado sobre cada actualización de tu pedido.
                </p>
              </div>
              
              <!-- Progress Steps mejorado -->
              <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 16px; padding: 24px; margin-bottom: 28px; border: 1px solid #e2e8f0;">
                <h3 style="margin: 0 0 20px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; text-align: center;">
                  Estado de tu pedido
                </h3>
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    ${this.renderProgressSteps(2)}
                  </tr>
                </table>
              </div>
              
              <!-- Detalle del pedido -->
              <div style="background: #ffffff; border: 2px solid #e2e8f0; border-radius: 16px; overflow: hidden; margin-bottom: 24px;">
                <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 16px 20px; border-bottom: 2px solid #e2e8f0;">
                  <h3 style="margin: 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                    📦 Detalle de tu pedido
                  </h3>
                </div>
                <div style="padding: 8px 20px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    ${itemsHtml}
                  </table>
                </div>
              </div>
              
              ${
                order.notes
                  ? `
              <!-- Notas del pedido -->
              <div style="background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 12px 12px 0; padding: 16px 20px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>📝 Notas:</strong> ${order.notes}
                </p>
              </div>
              `
                  : ''
              }
              
              <!-- Totales con diseño mejorado -->
              <div style="background: #f8fafc; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 10px 0; color: #64748b; font-size: 15px;">Subtotal</td>
                    <td style="text-align: right; color: #1e293b; font-size: 15px; font-weight: 500;">$${this.formatPrice(order.subtotal)}</td>
                  </tr>
                  ${
                    order.deliveryFee > 0
                      ? `
                  <tr>
                    <td style="padding: 10px 0; color: #64748b; font-size: 15px;">🚚 Costo de envío</td>
                    <td style="text-align: right; color: #1e293b; font-size: 15px; font-weight: 500;">$${this.formatPrice(order.deliveryFee)}</td>
                  </tr>
                  `
                      : ''
                  }
                  ${
                    order.tip > 0
                      ? `
                  <tr>
                    <td style="padding: 10px 0; color: #64748b; font-size: 15px;">💜 Propina</td>
                    <td style="text-align: right; color: #1e293b; font-size: 15px; font-weight: 500;">$${this.formatPrice(order.tip)}</td>
                  </tr>
                  `
                      : ''
                  }
                  <tr>
                    <td colspan="2" style="padding-top: 16px; border-top: 2px dashed #e2e8f0;"></td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #1e293b; font-size: 18px; font-weight: 700;">Total pagado</td>
                    <td style="text-align: right; font-size: 24px; font-weight: 800;">
                      <span style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">$${this.formatPrice(order.total)}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Información de entrega -->
              ${deliveryTypeHtml}
              
              <!-- CTA Button mejorado -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 32px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${trackingUrl}" class="btn-primary" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 20px 48px; border-radius: 14px; font-weight: 700; font-size: 16px; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);">
                      📍 Seguir mi pedido en vivo
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding-top: 16px;">
                    <p style="margin: 0; font-size: 13px; color: #94a3b8;">
                      O copiá este enlace: <a href="${trackingUrl}" style="color: #10b981;">${trackingUrl.substring(0, 50)}...</a>
                    </p>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer mejorado -->
          ${this.renderFooter(restaurant)}
          
        </table>
        
        <!-- Mini footer con disclaimer -->
        <table cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 24px auto 0;">
          <tr>
            <td style="text-align: center; padding: 0 20px;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.6;">
                Este email fue enviado porque realizaste un pedido en ${restaurant.name}.<br>
                Si no realizaste este pedido, por favor contactanos inmediatamente.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // New Order Email (Restaurant)
  // ─────────────────────────────────────────────────────────────

  private renderNewOrderEmail(
    order: OrderData,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _restaurant: RestaurantData,
  ): string {
    const orderTime = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const orderDate = new Date().toLocaleDateString('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="vertical-align: top;">
                  <div style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 6px 14px; border-radius: 8px; font-size: 15px; font-weight: 800; margin-right: 12px;">×${item.quantity}</div>
                  <span style="font-weight: 700; color: #1e293b; font-size: 16px;">${item.name}</span>
                  ${
                    item.notes
                      ? `
                    <div style="margin-top: 10px; padding: 12px 14px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 8px; font-size: 14px; color: #78350f; border-left: 4px solid #f59e0b;">
                      <strong>⚠️ NOTA:</strong> ${item.notes}
                    </div>
                  `
                      : ''
                  }
                </td>
                <td style="text-align: right; font-weight: 700; color: #1e293b; font-size: 16px; white-space: nowrap; vertical-align: top; padding-left: 16px;">
                  $${this.formatPrice(item.unitPrice * item.quantity)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `,
      )
      .join('');

    const orderTypeConfig = {
      DELIVERY: {
        icon: '🚚',
        label: 'DELIVERY',
        color: '#3b82f6',
        bg: '#dbeafe',
      },
      PICKUP: { icon: '🏃', label: 'RETIRO', color: '#10b981', bg: '#d1fae5' },
      DINE_IN: {
        icon: '🍽️',
        label: 'EN LOCAL',
        color: '#8b5cf6',
        bg: '#ede9fe',
      },
    };
    const typeInfo =
      orderTypeConfig[order.type as keyof typeof orderTypeConfig] ||
      orderTypeConfig.PICKUP;

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔔 NUEVO PEDIDO - ${order.orderNumber}</title>
  ${this.getBaseStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #fef3c7;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fef3c7;">
    <tr>
      <td class="email-wrapper" style="padding: 32px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 50px rgba(245, 158, 11, 0.3);">
          
          <!-- Header con diseño de urgencia -->
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%); padding: 36px 40px; text-align: center;">
              <div style="background: rgba(255,255,255,0.2); width: 72px; height: 72px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 40px; line-height: 72px;">🔔</span>
              </div>
              <h1 style="margin: 0 0 6px; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">¡NUEVO PEDIDO!</h1>
              <p style="margin: 0 0 16px; font-size: 15px; color: rgba(255,255,255,0.9);">Recibido ${orderDate} a las ${orderTime}</p>
              <div style="display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
                <span style="background: rgba(255,255,255,0.25); color: white; font-weight: 700; font-size: 18px; padding: 10px 24px; border-radius: 50px; border: 1px solid rgba(255,255,255,0.3);">
                  #${order.orderNumber}
                </span>
                <span style="background: ${typeInfo.bg}; color: ${typeInfo.color}; font-weight: 700; font-size: 14px; padding: 10px 20px; border-radius: 50px;">
                  ${typeInfo.icon} ${typeInfo.label}
                </span>
              </div>
            </td>
          </tr>
          
          <!-- Banner de acción urgente -->
          <tr>
            <td style="padding: 0 24px;">
              <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); margin-top: -16px; border-radius: 12px; padding: 16px 20px; text-align: center; border: 2px dashed #f59e0b; position: relative;">
                <span style="font-size: 20px; vertical-align: middle;">⚡</span>
                <strong style="color: #78350f; font-size: 15px; margin-left: 8px; vertical-align: middle;">PAGO CONFIRMADO - PREPARAR INMEDIATAMENTE</strong>
              </div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="email-content" style="padding: 28px 32px 36px;">
              
              <!-- Info del cliente y tipo de orden en grid -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td style="width: 48%; vertical-align: top; padding-right: 8px;">
                    <div style="background: #f8fafc; border-radius: 14px; padding: 18px; height: 100%; border: 1px solid #e2e8f0;">
                      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8;">👤 Cliente</p>
                      <p style="margin: 0 0 10px; font-size: 17px; font-weight: 700; color: #1e293b;">${order.customerName}</p>
                      <p style="margin: 0; font-size: 14px; color: #64748b;">
                        <a href="tel:${order.customerPhone}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">📱 ${order.customerPhone}</a>
                      </p>
                      ${order.customerEmail ? `<p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">${order.customerEmail}</p>` : ''}
                    </div>
                  </td>
                  <td style="width: 48%; vertical-align: top; padding-left: 8px;">
                    <div style="background: ${typeInfo.bg}; border-radius: 14px; padding: 18px; height: 100%; border: 1px solid ${typeInfo.color}20;">
                      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${typeInfo.color};">${typeInfo.icon} ${typeInfo.label}</p>
                      ${
                        order.type === 'DELIVERY'
                          ? `
                        <p style="margin: 0 0 6px; font-size: 15px; font-weight: 600; color: #1e293b; line-height: 1.4;">📍 ${order.deliveryAddress}</p>
                        ${order.deliveryNotes ? `<p style="margin: 0; font-size: 13px; color: #64748b; padding: 8px; background: rgba(255,255,255,0.6); border-radius: 6px;">📝 ${order.deliveryNotes}</p>` : ''}
                      `
                          : `
                        <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">
                          ${order.type === 'PICKUP' ? 'El cliente retira en el local' : 'Servir en mesa'}
                        </p>
                      `
                      }
                    </div>
                  </td>
                </tr>
              </table>
              
              ${
                order.notes
                  ? `
              <!-- Notas generales del pedido -->
              <div style="background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 0 12px 12px 0; padding: 14px 18px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px; color: #991b1b;">
                  <strong>⚠️ NOTA DEL CLIENTE:</strong> ${order.notes}
                </p>
              </div>
              `
                  : ''
              }
              
              <!-- Items del pedido con diseño destacado -->
              <div style="background: #ffffff; border: 2px solid #1e293b; border-radius: 16px; overflow: hidden; margin-bottom: 20px;">
                <div style="background: #1e293b; padding: 14px 20px;">
                  <h3 style="margin: 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #ffffff;">
                    📦 ITEMS DEL PEDIDO (${order.items.reduce((sum, i) => sum + i.quantity, 0)} items)
                  </h3>
                </div>
                <div style="padding: 8px 20px 16px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    ${itemsHtml}
                  </table>
                </div>
              </div>
              
              <!-- Total destacado -->
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px; padding: 24px; text-align: center;">
                <p style="margin: 0 0 8px; font-size: 14px; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 1px;">💰 Total del Pedido</p>
                <p style="margin: 0; font-size: 36px; font-weight: 800; color: #ffffff; letter-spacing: -1px;">$${this.formatPrice(order.total)}</p>
                ${order.tip > 0 ? `<p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.9);">Incluye propina de $${this.formatPrice(order.tip)} 💜</p>` : ''}
              </div>
              
            </td>
          </tr>
          
          <!-- Footer para restaurante -->
          <tr>
            <td style="background: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 13px; color: #64748b;">
                Recibido automáticamente por el sistema de pedidos • ${orderDate} ${orderTime}
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // Status Update Email (Customer)
  // ─────────────────────────────────────────────────────────────

  private renderStatusUpdateEmail(
    order: OrderData,
    restaurant: RestaurantData,
    trackingUrl: string,
  ): string {
    const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
    const updateTime = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Generar gradiente dinámico basado en el color del estado
    const gradientColor = this.adjustColor(config.color, -20);

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title} - Pedido #${order.orderNumber}</title>
  ${this.getBaseStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td class="email-wrapper" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
          
          <!-- Header con color del estado -->
          <tr>
            <td class="email-header" style="background: linear-gradient(135deg, ${config.color} 0%, ${gradientColor} 100%); padding: 52px 40px; text-align: center;">
              <div style="width: 100px; height: 100px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px);">
                <span style="font-size: 56px; line-height: 100px;">${config.emoji}</span>
              </div>
              <h1 style="margin: 0 0 10px; font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${config.title}</h1>
              <p style="margin: 0; font-size: 17px; color: rgba(255,255,255,0.95);">${config.subtitle}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="email-content" style="padding: 40px;">
              
              <!-- Badge del pedido -->
              <div style="text-align: center; margin-bottom: 28px;">
                <span style="display: inline-block; background: ${config.bgColor}; color: ${config.color}; padding: 14px 28px; border-radius: 50px; font-weight: 700; font-size: 16px; border: 2px solid ${config.color}20;">
                  🧾 Pedido #${order.orderNumber}
                </span>
                <p style="margin: 12px 0 0; font-size: 13px; color: #94a3b8;">Actualizado a las ${updateTime}</p>
              </div>
              
              <!-- Progress Tracker mejorado -->
              ${
                order.status !== 'CANCELLED'
                  ? `
              <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 16px; padding: 28px 24px; margin-bottom: 28px; border: 1px solid #e2e8f0;">
                <h3 style="margin: 0 0 24px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; text-align: center;">
                  Progreso de tu pedido
                </h3>
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    ${this.renderProgressSteps(config.step)}
                  </tr>
                </table>
              </div>
              `
                  : ''
              }
              
              <!-- Mensaje personalizado del estado -->
              <div style="background: ${config.bgColor}; border-radius: 16px; padding: 24px; margin-bottom: 28px; border-left: 5px solid ${config.color};">
                <p style="margin: 0 0 12px; font-size: 16px; color: #1e293b; line-height: 1.7;">
                  ${config.customerMessage}
                </p>
                <p style="margin: 0; font-size: 14px; color: #64748b; font-style: italic;">
                  ${config.actionTip}
                </p>
              </div>
              
              <!-- Información del restaurante -->
              <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td>
                      <p style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #1e293b;">${restaurant.name}</p>
                      <p style="margin: 0; font-size: 13px; color: #64748b;">📍 ${restaurant.address}</p>
                    </td>
                    <td style="text-align: right;">
                      <a href="tel:${restaurant.phone}" style="display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;">
                        📞 Llamar
                      </a>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="${trackingUrl}" class="btn-primary" style="display: inline-block; background: linear-gradient(135deg, ${config.color} 0%, ${gradientColor} 100%); color: #ffffff; text-decoration: none; padding: 20px 48px; border-radius: 14px; font-weight: 700; font-size: 16px; box-shadow: 0 8px 24px ${config.color}40;">
                      📍 Ver estado en tiempo real
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer -->
          ${this.renderFooter(restaurant)}
          
        </table>
        
        <!-- Mini footer -->
        <table cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 24px auto 0;">
          <tr>
            <td style="text-align: center; padding: 0 20px;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.6;">
                Recibís este email porque tenés un pedido activo en ${restaurant.name}.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Ajusta el brillo de un color hex
   */
  private adjustColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  }

  /**
   * Calcula tiempo estimado basado en tipo de orden y items
   */
  private getEstimatedTime(order: OrderData): string | null {
    const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);
    let baseMinutes = 15 + totalItems * 3; // Base + 3 min por item

    if (order.type === 'DELIVERY') {
      baseMinutes += 20; // Tiempo de entrega
      return `Estimado: ${baseMinutes}-${baseMinutes + 15} min`;
    } else if (order.type === 'PICKUP') {
      return `Listo en: ~${baseMinutes} min`;
    }
    return null;
  }

  private renderProgressSteps(currentStep: number): string {
    const steps = [
      { num: 2, label: 'Pagado', icon: '💳' },
      { num: 3, label: 'Confirmado', icon: '👨‍🍳' },
      { num: 4, label: 'Preparando', icon: '🔥' },
      { num: 5, label: 'Listo', icon: '✅' },
    ];

    return steps
      .map((step, index) => {
        const isCompleted = currentStep >= step.num;
        const isActive = currentStep === step.num;
        const isLast = index === steps.length - 1;

        const circleStyle = isCompleted
          ? 'background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);'
          : 'background: #e2e8f0; color: #94a3b8;';

        const labelStyle = isActive
          ? 'color: #10b981; font-weight: 700;'
          : isCompleted
            ? 'color: #475569; font-weight: 500;'
            : 'color: #94a3b8;';

        const lineStyle =
          isCompleted && !isLast
            ? 'background: linear-gradient(90deg, #10b981, #059669);'
            : 'background: #e2e8f0;';

        return `
          <td class="progress-step" style="width: 25%; text-align: center; vertical-align: top; position: relative; padding: 0 4px;">
            <div style="display: inline-block; width: 44px; height: 44px; border-radius: 50%; ${circleStyle} line-height: 44px; font-size: 18px; border: 3px solid ${isCompleted ? '#10b981' : '#e2e8f0'};">
              ${isCompleted ? '✓' : step.icon}
            </div>
            <p style="margin: 10px 0 0; font-size: 12px; ${labelStyle}">${step.label}</p>
            ${!isLast ? `<div style="position: absolute; top: 22px; left: 62%; width: 76%; height: 4px; ${lineStyle} border-radius: 2px;"></div>` : ''}
          </td>
        `;
      })
      .join('');
  }

  private getDeliveryTypeHtml(order: OrderData): string {
    const typeConfig = {
      DELIVERY: {
        icon: '🚚',
        title: 'Entrega a domicilio',
        subtitle: 'Te lo llevamos a tu puerta',
        color: '#3b82f6',
        bgColor: '#dbeafe',
        borderColor: '#93c5fd',
      },
      PICKUP: {
        icon: '🏃',
        title: 'Retiro en local',
        subtitle: 'Pasá a buscarlo cuando esté listo',
        color: '#10b981',
        bgColor: '#d1fae5',
        borderColor: '#6ee7b7',
      },
      DINE_IN: {
        icon: '🍽️',
        title: 'Consumo en local',
        subtitle: 'Te lo llevamos a tu mesa',
        color: '#8b5cf6',
        bgColor: '#ede9fe',
        borderColor: '#c4b5fd',
      },
    };

    const config =
      typeConfig[order.type as keyof typeof typeConfig] || typeConfig.PICKUP;

    return `
      <div style="background: ${config.bgColor}; border-radius: 16px; border: 2px solid ${config.borderColor}; overflow: hidden; margin-top: 24px;">
        <div style="padding: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 28px; margin-right: 12px;">${config.icon}</span>
            <div>
              <p style="margin: 0; font-size: 16px; font-weight: 700; color: ${config.color};">${config.title}</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">${config.subtitle}</p>
            </div>
          </div>
          ${
            order.type === 'DELIVERY' && order.deliveryAddress
              ? `
            <div style="background: rgba(255,255,255,0.6); border-radius: 10px; padding: 14px; margin-top: 12px;">
              <p style="margin: 0 0 6px; font-size: 15px; font-weight: 600; color: #1e293b;">📍 ${order.deliveryAddress}</p>
              ${order.deliveryNotes ? `<p style="margin: 0; font-size: 14px; color: #64748b;">📝 ${order.deliveryNotes}</p>` : ''}
            </div>
          `
              : ''
          }
        </div>
      </div>
    `;
  }

  private getStatusDetailedMessage(
    status: string,
    orderType: string,
    restaurantName: string,
  ): string {
    const deliveryText =
      orderType === 'DELIVERY'
        ? 'Te lo llevaremos pronto'
        : orderType === 'PICKUP'
          ? 'Pronto podrás retirarlo'
          : '';

    const messages: Record<string, string> = {
      PAID: `Tu pago fue procesado correctamente. <strong>${restaurantName}</strong> recibirá tu pedido en instantes.`,
      CONFIRMED: `<strong>${restaurantName}</strong> confirmó tu pedido y comenzará a prepararlo.`,
      PREPARING: `¡Tu pedido está siendo preparado con mucho cariño! 🍳 ${deliveryText}`,
      READY:
        orderType === 'PICKUP'
          ? `¡Tu pedido está listo! Acercate a <strong>${restaurantName}</strong> para retirarlo.`
          : orderType === 'DELIVERY'
            ? '¡Tu pedido está listo y en camino! 🛵'
            : `¡Tu pedido está listo! Pronto te lo llevarán a tu mesa.`,
      DELIVERED: '¡Esperamos que lo disfrutes! Gracias por elegirnos. 💚',
      CANCELLED:
        'Lamentamos que no hayas podido completar tu pedido. Si tenés alguna consulta, contactanos.',
    };

    return messages[status] || '';
  }

  private renderFooter(restaurant: RestaurantData): string {
    return `
      <tr>
        <td style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); padding: 36px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
          <!-- Logo/nombre del restaurante -->
          <div style="margin-bottom: 16px;">
            <p style="margin: 0; font-size: 20px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px;">${restaurant.name}</p>
          </div>
          
          <!-- Info de contacto -->
          <table cellpadding="0" cellspacing="0" style="margin: 0 auto 20px;">
            <tr>
              <td style="padding: 0 16px;">
                <a href="https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}" style="color: #64748b; text-decoration: none; font-size: 13px;">
                  📍 ${restaurant.address}
                </a>
              </td>
              <td style="padding: 0 16px; border-left: 1px solid #e2e8f0;">
                <a href="tel:${restaurant.phone}" style="color: #64748b; text-decoration: none; font-size: 13px;">
                  📞 ${restaurant.phone}
                </a>
              </td>
            </tr>
          </table>
          
          <!-- Separador decorativo -->
          <div style="width: 80px; height: 4px; background: linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6); margin: 0 auto 20px; border-radius: 2px;"></div>
          
          <!-- Help text -->
          <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
            ¿Tenés alguna pregunta sobre tu pedido?
          </p>
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">
            Respondé este email o llamanos, estamos para ayudarte 💚
          </p>
        </td>
      </tr>
    `;
  }

  private formatPrice(amount: number): string {
    return Number(amount).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // SUBSCRIPTION EMAILS
  // ─────────────────────────────────────────────────────────────

  /**
   * Email de bienvenida al trial de 14 días
   */
  async sendWelcomeTrialEmail(
    email: string,
    restaurantName: string,
    planName: string,
    trialEndDate: Date,
  ): Promise<boolean> {
    const formattedDate = this.formatDate(trialEndDate);
    const html = this.renderSubscriptionEmail({
      title: '🎉 ¡Bienvenido a Restoo!',
      subtitle: `Tu período de prueba de ${planName} comenzó`,
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          ¡Hola! Gracias por elegir <strong>Restoo</strong> para <strong>${restaurantName}</strong>.
        </p>
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          Tu período de prueba <strong>gratuito de 14 días</strong> del plan <strong>${planName}</strong> ya está activo.
        </p>
        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #166534; font-size: 14px;">
            ✅ <strong>Tu trial termina el ${formattedDate}</strong><br>
            Hasta entonces, disfrutá de todas las funcionalidades premium sin costo.
          </p>
        </div>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Si tenés alguna pregunta, no dudes en contactarnos.
        </p>
      `,
      ctaText: 'Ir al Dashboard',
      ctaUrl: `${this.frontendUrl}/admin`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `🎉 ¡Bienvenido a Restoo! Tu trial de ${planName} comenzó`,
      html,
    });
  }

  /**
   * Aviso de trial por terminar (3 días o 1 día antes)
   */
  async sendTrialEndingEmail(
    email: string,
    restaurantName: string,
    planName: string,
    daysRemaining: number,
    amount: number,
  ): Promise<boolean> {
    const dayText = daysRemaining === 1 ? 'día' : 'días';
    const urgencyColor = daysRemaining === 1 ? '#dc2626' : '#f59e0b';
    const formattedAmount = this.formatPrice(amount / 100);

    const html = this.renderSubscriptionEmail({
      title: `⏰ Tu trial termina en ${daysRemaining} ${dayText}`,
      subtitle: `No pierdas acceso a ${planName}`,
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          ¡Hola! Te recordamos que el período de prueba de <strong>${restaurantName}</strong> está por terminar.
        </p>
        <div style="background: #fffbeb; border-left: 4px solid ${urgencyColor}; padding: 16px; margin: 24px 0;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            ⚠️ <strong>Quedan ${daysRemaining} ${dayText}</strong> de tu trial del plan ${planName}.
          </p>
        </div>
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          Para continuar disfrutando de todas las funcionalidades, agregá un método de pago.
          El plan ${planName} tiene un costo de <strong>$${formattedAmount}/mes</strong>.
        </p>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Si decidís no continuar, tu cuenta pasará automáticamente al plan <strong>Starter (gratuito)</strong>.
        </p>
      `,
      ctaText: 'Agregar método de pago',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `⏰ Tu trial de ${planName} termina en ${daysRemaining} ${dayText}`,
      html,
    });
  }

  /**
   * Trial expirado - acción requerida
   */
  async sendTrialExpiredEmail(
    email: string,
    restaurantName: string,
    planName: string,
  ): Promise<boolean> {
    const html = this.renderSubscriptionEmail({
      title: '⌛ Tu período de prueba terminó',
      subtitle: 'Suscribite para seguir usando las funciones premium',
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          El período de prueba del plan <strong>${planName}</strong> para <strong>${restaurantName}</strong> ha terminado.
        </p>
        <div style="background: #fef2f2; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #991b1b; font-size: 14px;">
            ❌ Ya no tenés acceso a las funcionalidades premium.
          </p>
        </div>
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          No te preocupes, tus datos están seguros. Podés suscribirte en cualquier momento para recuperar el acceso completo.
        </p>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Mientras tanto, podés seguir usando las funciones del plan <strong>Starter (gratuito)</strong>.
        </p>
      `,
      ctaText: 'Suscribirme ahora',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `⌛ Tu trial de ${planName} terminó - ${restaurantName}`,
      html,
    });
  }

  /**
   * Pago exitoso
   */
  async sendPaymentSuccessEmail(
    email: string,
    restaurantName: string,
    planName: string,
    amount: number,
    nextBillingDate: Date,
  ): Promise<boolean> {
    const formattedAmount = this.formatPrice(amount / 100);
    const formattedDate = this.formatDate(nextBillingDate);

    const html = this.renderSubscriptionEmail({
      title: '✅ ¡Pago confirmado!',
      subtitle: `Tu suscripción a ${planName} está activa`,
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          ¡Gracias! Recibimos tu pago correctamente para <strong>${restaurantName}</strong>.
        </p>
        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Plan:</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; text-align: right; font-weight: 600;">${planName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Monto:</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; text-align: right; font-weight: 600;">$${formattedAmount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Próxima facturación:</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; text-align: right; font-weight: 600;">${formattedDate}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Podés ver el historial de pagos y gestionar tu suscripción desde el dashboard.
        </p>
      `,
      ctaText: 'Ver mi suscripción',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `✅ Pago confirmado - Plan ${planName}`,
      html,
    });
  }

  /**
   * Pago fallido
   */
  async sendPaymentFailedEmail(
    email: string,
    restaurantName: string,
    planName: string,
    amount: number,
  ): Promise<boolean> {
    const formattedAmount = this.formatPrice(amount / 100);

    const html = this.renderSubscriptionEmail({
      title: '❌ Problema con tu pago',
      subtitle: 'Actualizá tu método de pago para continuar',
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          No pudimos procesar el pago de <strong>$${formattedAmount}</strong> para <strong>${restaurantName}</strong>.
        </p>
        <div style="background: #fef2f2; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #991b1b; font-size: 14px;">
            ⚠️ <strong>Tu suscripción está en riesgo</strong><br>
            Tenés 3 días para actualizar tu método de pago antes de perder el acceso.
          </p>
        </div>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Verificá que tu tarjeta tenga fondos suficientes o agregá un nuevo método de pago.
        </p>
      `,
      ctaText: 'Actualizar método de pago',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `❌ Problema con tu pago - ${restaurantName}`,
      html,
    });
  }

  /**
   * Suscripción cancelada
   */
  async sendSubscriptionCanceledEmail(
    email: string,
    restaurantName: string,
    planName: string,
    accessEndDate: Date,
  ): Promise<boolean> {
    const formattedDate = this.formatDate(accessEndDate);

    const html = this.renderSubscriptionEmail({
      title: '😢 Suscripción cancelada',
      subtitle: 'Esperamos verte pronto de nuevo',
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          Tu suscripción al plan <strong>${planName}</strong> para <strong>${restaurantName}</strong> ha sido cancelada.
        </p>
        <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #475569; font-size: 14px;">
            📅 <strong>Tenés acceso hasta el ${formattedDate}</strong><br>
            Después de esa fecha, tu cuenta pasará al plan Starter (gratuito).
          </p>
        </div>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Si cambiás de opinión, podés reactivar tu suscripción en cualquier momento antes de esa fecha.
        </p>
      `,
      ctaText: 'Reactivar suscripción',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `😢 Suscripción cancelada - ${restaurantName}`,
      html,
    });
  }

  /**
   * Suscripción reactivada
   */
  async sendSubscriptionReactivatedEmail(
    email: string,
    restaurantName: string,
    planName: string,
  ): Promise<boolean> {
    const html = this.renderSubscriptionEmail({
      title: '🎉 ¡Bienvenido de nuevo!',
      subtitle: `Tu suscripción a ${planName} fue reactivada`,
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          ¡Excelente noticia! Tu suscripción al plan <strong>${planName}</strong> para <strong>${restaurantName}</strong> ha sido reactivada.
        </p>
        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #166534; font-size: 14px;">
            ✅ <strong>Todas tus funcionalidades premium están activas nuevamente</strong>
          </p>
        </div>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Gracias por seguir confiando en Restoo. ¡Estamos felices de tenerte de vuelta!
        </p>
      `,
      ctaText: 'Ir al Dashboard',
      ctaUrl: `${this.frontendUrl}/admin`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `🎉 ¡Bienvenido de nuevo! - ${restaurantName}`,
      html,
    });
  }

  /**
   * Plan mejorado (upgrade)
   */
  async sendPlanUpgradedEmail(
    email: string,
    restaurantName: string,
    oldPlanName: string,
    newPlanName: string,
  ): Promise<boolean> {
    const html = this.renderSubscriptionEmail({
      title: '🚀 ¡Plan mejorado!',
      subtitle: `Ahora tenés acceso a ${newPlanName}`,
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          ¡Felicitaciones! Actualizaste el plan de <strong>${restaurantName}</strong>.
        </p>
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 8px; color: rgba(255,255,255,0.8); font-size: 14px;">${oldPlanName}</p>
          <p style="margin: 0 0 8px; color: #fff; font-size: 24px;">⬇️</p>
          <p style="margin: 0; color: #fff; font-size: 20px; font-weight: 700;">${newPlanName}</p>
        </div>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Todas las nuevas funcionalidades ya están disponibles. ¡Explorá todo lo que podés hacer ahora!
        </p>
      `,
      ctaText: 'Explorar nuevas funciones',
      ctaUrl: `${this.frontendUrl}/admin`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `🚀 ¡Bienvenido a ${newPlanName}! - ${restaurantName}`,
      html,
    });
  }

  /**
   * Plan reducido (downgrade)
   */
  async sendPlanDowngradedEmail(
    email: string,
    restaurantName: string,
    oldPlanName: string,
    newPlanName: string,
    effectiveDate: Date,
  ): Promise<boolean> {
    const formattedDate = this.formatDate(effectiveDate);

    const html = this.renderSubscriptionEmail({
      title: '📝 Cambio de plan confirmado',
      subtitle: `Tu plan cambiará a ${newPlanName}`,
      content: `
        <p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">
          Confirmamos el cambio de plan para <strong>${restaurantName}</strong>.
        </p>
        <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Plan actual:</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; text-align: right;">${oldPlanName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Nuevo plan:</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; text-align: right; font-weight: 600;">${newPlanName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Fecha de cambio:</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; text-align: right;">${formattedDate}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
          Hasta esa fecha, seguirás teniendo acceso a todas las funciones de ${oldPlanName}.
        </p>
      `,
      ctaText: 'Ver mi suscripción',
      ctaUrl: `${this.frontendUrl}/admin/subscription`,
    });

    return this.sendEmail({
      from: `Restoo <${this.fromEmail}>`,
      to: email,
      subject: `📝 Cambio de plan programado - ${restaurantName}`,
      html,
    });
  }

  /**
   * Send a generic notification email
   */
  async sendNotificationEmail(
    to: string,
    subject: string,
    title: string,
    message: string,
    data?: any,
  ): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>
          </div>

          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <p style="font-size: 16px; margin-bottom: 20px;">${message}</p>

            ${
              data
                ? `
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
                <h3 style="margin-top: 0; color: #667eea;">Detalles adicionales:</h3>
                <pre style="background: white; padding: 10px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 12px;">${JSON.stringify(data, null, 2)}</pre>
              </div>
            `
                : ''
            }

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #666; font-size: 14px; text-align: center;">
              Esta es una notificación automática del sistema de gestión de restaurantes.<br>
              Si tienes alguna pregunta, contacta con el administrador de tu restaurante.
            </p>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      from: `Sistema de Notificaciones <${this.fromEmail}>`,
      to,
      subject,
      html,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Subscription Email Template
  // ─────────────────────────────────────────────────────────────

  private renderSubscriptionEmail(params: {
    title: string;
    subtitle: string;
    content: string;
    ctaText: string;
    ctaUrl: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${params.title}</title>
          ${this.getBaseStyles()}
        </head>
        <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 32px; text-align: center;">
                      <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 28px; font-weight: 700;">${params.title}</h1>
                      <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">${params.subtitle}</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 32px;">
                      ${params.content}
                      
                      <!-- CTA Button -->
                      <div style="text-align: center; margin-top: 32px;">
                        <a href="${params.ctaUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px;">
                          ${params.ctaText}
                        </a>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
                      <p style="margin: 0 0 8px; font-size: 16px; font-weight: 700; color: #1e293b;">Restoo</p>
                      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                        Sistema de gestión para restaurantes
                      </p>
                      <div style="width: 60px; height: 3px; background: linear-gradient(90deg, #10b981, #3b82f6); margin: 16px auto; border-radius: 2px;"></div>
                      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                        ¿Necesitás ayuda? <a href="mailto:soporte@restoo.com.ar" style="color: #10b981; text-decoration: none;">soporte@restoo.com.ar</a>
                      </p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
