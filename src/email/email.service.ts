import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

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
  }
> = {
  PENDING: {
    emoji: '⏳',
    title: 'Esperando pago',
    subtitle: 'Tu pedido está pendiente de pago',
    color: '#f59e0b',
    bgColor: '#fef3c7',
    step: 1,
  },
  PAID: {
    emoji: '💳',
    title: '¡Pago confirmado!',
    subtitle: 'Tu pago se procesó correctamente',
    color: '#10b981',
    bgColor: '#d1fae5',
    step: 2,
  },
  CONFIRMED: {
    emoji: '👨‍🍳',
    title: 'Pedido confirmado',
    subtitle: 'El restaurante recibió tu pedido',
    color: '#3b82f6',
    bgColor: '#dbeafe',
    step: 3,
  },
  PREPARING: {
    emoji: '🔥',
    title: '¡En preparación!',
    subtitle: 'Estamos cocinando tu pedido',
    color: '#f97316',
    bgColor: '#ffedd5',
    step: 4,
  },
  READY: {
    emoji: '✅',
    title: '¡Pedido listo!',
    subtitle: 'Tu pedido está listo para entregar',
    color: '#22c55e',
    bgColor: '#dcfce7',
    step: 5,
  },
  DELIVERED: {
    emoji: '🎉',
    title: '¡Entregado!',
    subtitle: '¡Gracias por tu compra!',
    color: '#8b5cf6',
    bgColor: '#ede9fe',
    step: 6,
  },
  CANCELLED: {
    emoji: '❌',
    title: 'Pedido cancelado',
    subtitle: 'Tu pedido ha sido cancelado',
    color: '#ef4444',
    bgColor: '#fee2e2',
    step: -1,
  },
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
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

  private async sendEmail(params: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
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
        /* Reset */
        body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        
        /* Base */
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background-color: #f8fafc;
          color: #1e293b;
          line-height: 1.6;
        }
        
        /* Responsive */
        @media screen and (max-width: 600px) {
          .email-content { padding: 20px !important; }
          .email-header { padding: 30px 20px !important; }
          .email-header h1 { font-size: 24px !important; }
          .btn-primary { padding: 14px 24px !important; font-size: 15px !important; }
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
    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <span style="display: inline-block; background: #10b981; color: white; padding: 3px 10px; border-radius: 6px; font-size: 13px; font-weight: 700; margin-right: 10px;">${item.quantity}x</span>
                  <span style="font-weight: 600; color: #1e293b; font-size: 15px;">${item.name}</span>
                  ${item.notes ? `<p style="margin: 6px 0 0; font-size: 13px; color: #64748b;">📝 ${item.notes}</p>` : ''}
                </td>
                <td style="text-align: right; font-weight: 600; color: #1e293b; white-space: nowrap;">
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
<body style="margin: 0; padding: 0; background-color: #f8fafc;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 48px 40px; text-align: center;">
              <div style="font-size: 56px; margin-bottom: 16px;">✅</div>
              <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #ffffff;">¡Pedido Confirmado!</h1>
              <p style="margin: 0; font-size: 16px; color: rgba(255,255,255,0.9);">Tu pago se procesó exitosamente</p>
              <div style="margin-top: 20px; background: rgba(255,255,255,0.2); display: inline-block; padding: 10px 24px; border-radius: 30px;">
                <span style="color: white; font-weight: 700; font-size: 18px;">Pedido #${order.orderNumber}</span>
              </div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              
              <!-- Greeting -->
              <p style="font-size: 17px; color: #1e293b; margin: 0 0 8px;">
                ¡Hola <strong>${order.customerName}</strong>! 👋
              </p>
              <p style="font-size: 15px; color: #64748b; margin: 0 0 32px; line-height: 1.6;">
                Gracias por tu pedido en <strong style="color: #1e293b;">${restaurant.name}</strong>. 
                Te avisaremos cada vez que el estado de tu pedido cambie.
              </p>
              
              <!-- Order Status Progress -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td style="background: #f0fdf4; border-radius: 12px; padding: 24px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        ${this.renderProgressSteps(2)}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Order Items -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background: #f8fafc; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 16px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">
                      📦 Tu Pedido
                    </h3>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      ${itemsHtml}
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Totals -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px;">
                <tr>
                  <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="color: #64748b; font-size: 15px;">Subtotal</td>
                        <td style="text-align: right; color: #1e293b; font-size: 15px;">$${this.formatPrice(order.subtotal)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  order.deliveryFee > 0
                    ? `
                <tr>
                  <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="color: #64748b; font-size: 15px;">🚚 Envío</td>
                        <td style="text-align: right; color: #1e293b; font-size: 15px;">$${this.formatPrice(order.deliveryFee)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                `
                    : ''
                }
                ${
                  order.tip > 0
                    ? `
                <tr>
                  <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="color: #64748b; font-size: 15px;">💝 Propina</td>
                        <td style="text-align: right; color: #1e293b; font-size: 15px;">$${this.formatPrice(order.tip)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                `
                    : ''
                }
                <tr>
                  <td style="padding: 20px 0;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="color: #1e293b; font-size: 20px; font-weight: 700;">Total</td>
                        <td style="text-align: right; color: #10b981; font-size: 24px; font-weight: 700;">$${this.formatPrice(order.total)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Delivery Info -->
              ${deliveryTypeHtml}
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 32px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${trackingUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 18px 40px; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                      📍 Seguir mi pedido en vivo
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer -->
          ${this.renderFooter(restaurant)}
          
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
    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 14px 0; border-bottom: 1px solid #e2e8f0;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <span style="display: inline-block; background: #f59e0b; color: white; padding: 4px 12px; border-radius: 6px; font-size: 14px; font-weight: 700; margin-right: 10px;">${item.quantity}x</span>
                  <span style="font-weight: 600; color: #1e293b; font-size: 16px;">${item.name}</span>
                  ${item.notes ? `<p style="margin: 8px 0 0; padding: 8px 12px; background: #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e; border-left: 3px solid #f59e0b;">📝 <strong>Nota:</strong> ${item.notes}</p>` : ''}
                </td>
                <td style="text-align: right; font-weight: 700; color: #1e293b; font-size: 16px; white-space: nowrap; vertical-align: top;">
                  $${this.formatPrice(item.unitPrice * item.quantity)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `,
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo Pedido - ${order.orderNumber}</title>
  ${this.getBaseStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 12px;">🔔</div>
              <h1 style="margin: 0 0 8px; font-size: 26px; font-weight: 700; color: #ffffff;">¡Nuevo Pedido!</h1>
              <div style="margin-top: 16px; background: rgba(255,255,255,0.2); display: inline-block; padding: 10px 24px; border-radius: 30px;">
                <span style="color: white; font-weight: 700; font-size: 18px;">#${order.orderNumber}</span>
              </div>
            </td>
          </tr>
          
          <!-- Urgent Banner -->
          <tr>
            <td style="padding: 0 32px;">
              <table cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; margin-top: -20px; position: relative; z-index: 1;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <span style="font-size: 24px;">⚡</span>
                    <strong style="color: #92400e; font-size: 16px; margin-left: 8px;">Pedido pagado - Confirmar y preparar</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px 40px;">
              
              <!-- Customer Info -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background: #f8fafc; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 16px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">
                      👤 Cliente
                    </h3>
                    <p style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #1e293b;">${order.customerName}</p>
                    <p style="margin: 0; font-size: 15px; color: #64748b;">
                      📱 <a href="tel:${order.customerPhone}" style="color: #3b82f6; text-decoration: none;">${order.customerPhone}</a>
                      ${order.customerEmail ? `<br>📧 <a href="mailto:${order.customerEmail}" style="color: #3b82f6; text-decoration: none;">${order.customerEmail}</a>` : ''}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Delivery Type -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background: ${order.type === 'DELIVERY' ? '#dbeafe' : order.type === 'PICKUP' ? '#d1fae5' : '#f3e8ff'}; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">
                      ${order.type === 'DELIVERY' ? '🚚 Delivery' : order.type === 'PICKUP' ? '🏃 Retiro en local' : '🍽️ Consumo en local'}
                    </h3>
                    ${
                      order.type === 'DELIVERY'
                        ? `
                      <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #1e293b;">📍 ${order.deliveryAddress}</p>
                      ${order.deliveryNotes ? `<p style="margin: 0; font-size: 14px; color: #64748b; padding: 10px; background: rgba(255,255,255,0.5); border-radius: 6px;">📝 ${order.deliveryNotes}</p>` : ''}
                    `
                        : ''
                    }
                  </td>
                </tr>
              </table>
              
              <!-- Order Items -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 16px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">
                      📦 Items del Pedido
                    </h3>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      ${itemsHtml}
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Total -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px;">
                <tr>
                  <td style="padding: 24px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="color: rgba(255,255,255,0.9); font-size: 16px;">💰 Total del pedido</td>
                        <td style="text-align: right; color: #ffffff; font-size: 28px; font-weight: 700;">$${this.formatPrice(order.total)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
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

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title} - ${order.orderNumber}</title>
  ${this.getBaseStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header with status color -->
          <tr>
            <td style="background: ${config.color}; padding: 48px 40px; text-align: center;">
              <div style="font-size: 72px; margin-bottom: 16px;">${config.emoji}</div>
              <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #ffffff;">${config.title}</h1>
              <p style="margin: 0; font-size: 16px; color: rgba(255,255,255,0.9);">${config.subtitle}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              
              <!-- Order Number Badge -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td style="text-align: center;">
                    <span style="display: inline-block; background: ${config.bgColor}; color: ${config.color}; padding: 12px 24px; border-radius: 30px; font-weight: 700; font-size: 16px;">
                      Pedido #${order.orderNumber}
                    </span>
                  </td>
                </tr>
              </table>
              
              <!-- Progress Tracker -->
              ${
                order.status !== 'CANCELLED'
                  ? `
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td style="background: #f8fafc; border-radius: 12px; padding: 24px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        ${this.renderProgressSteps(config.step)}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              `
                  : ''
              }
              
              <!-- Status Message -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td style="text-align: center; padding: 24px; background: ${config.bgColor}; border-radius: 12px;">
                    <p style="margin: 0; font-size: 16px; color: #1e293b; line-height: 1.6;">
                      ${this.getStatusDetailedMessage(order.status, order.type, restaurant.name)}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${trackingUrl}" style="display: inline-block; background: ${config.color}; color: #ffffff; text-decoration: none; padding: 18px 40px; border-radius: 12px; font-weight: 700; font-size: 16px;">
                      📍 Ver estado del pedido
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer -->
          ${this.renderFooter(restaurant)}
          
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
          ? 'background: #10b981; color: white;'
          : 'background: #e2e8f0; color: #94a3b8;';

        const labelStyle = isActive
          ? 'color: #10b981; font-weight: 600;'
          : isCompleted
            ? 'color: #64748b;'
            : 'color: #94a3b8;';

        const lineStyle =
          isCompleted && !isLast
            ? 'background: #10b981;'
            : 'background: #e2e8f0;';

        return `
          <td style="width: 25%; text-align: center; vertical-align: top; position: relative;">
            <div style="display: inline-block; width: 36px; height: 36px; border-radius: 50%; ${circleStyle} line-height: 36px; font-size: 16px;">
              ${isCompleted ? '✓' : step.icon}
            </div>
            <p style="margin: 8px 0 0; font-size: 11px; ${labelStyle}">${step.label}</p>
            ${!isLast ? `<div style="position: absolute; top: 18px; left: 60%; width: 80%; height: 3px; ${lineStyle}"></div>` : ''}
          </td>
        `;
      })
      .join('');
  }

  private getDeliveryTypeHtml(order: OrderData): string {
    const typeConfig = {
      DELIVERY: {
        icon: '🚚',
        title: 'Delivery',
        color: '#3b82f6',
        bgColor: '#dbeafe',
      },
      PICKUP: {
        icon: '🏃',
        title: 'Retiro en local',
        color: '#10b981',
        bgColor: '#d1fae5',
      },
      DINE_IN: {
        icon: '🍽️',
        title: 'Consumo en local',
        color: '#8b5cf6',
        bgColor: '#ede9fe',
      },
    };

    const config =
      typeConfig[order.type as keyof typeof typeConfig] || typeConfig.PICKUP;

    return `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px; background: ${config.bgColor}; border-radius: 12px;">
        <tr>
          <td style="padding: 20px;">
            <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${config.color};">
              ${config.icon} ${config.title}
            </h3>
            ${
              order.type === 'DELIVERY' && order.deliveryAddress
                ? `
              <p style="margin: 0 0 8px; font-size: 15px; color: #1e293b;">📍 ${order.deliveryAddress}</p>
              ${order.deliveryNotes ? `<p style="margin: 0; font-size: 14px; color: #64748b;">📝 ${order.deliveryNotes}</p>` : ''}
            `
                : ''
            }
          </td>
        </tr>
      </table>
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
        <td style="background: #f1f5f9; padding: 32px; text-align: center;">
          <p style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #1e293b;">${restaurant.name}</p>
          <p style="margin: 0 0 4px; font-size: 14px; color: #64748b;">📍 ${restaurant.address}</p>
          <p style="margin: 0; font-size: 14px; color: #64748b;">📞 ${restaurant.phone}</p>
          <div style="width: 60px; height: 3px; background: linear-gradient(90deg, #10b981, #3b82f6); margin: 20px auto; border-radius: 2px;"></div>
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">
            ¿Necesitás ayuda? Respondé este email o llamanos.
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
}
