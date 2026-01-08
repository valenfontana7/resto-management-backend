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
      subject: `✅ Pedido confirmado - ${order.orderNumber}`,
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
      subject: `🆕 Nuevo pedido - ${order.orderNumber}`,
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

    const statusMessages: Record<string, string> = {
      PAID: '💳 Tu pago ha sido confirmado',
      CONFIRMED: '👨‍🍳 Tu pedido ha sido confirmado',
      PREPARING: '🔥 Tu pedido está en preparación',
      READY: '✅ Tu pedido está listo',
      DELIVERED: '🎉 Pedido entregado',
      CANCELLED: '❌ Pedido cancelado',
    };

    const message = statusMessages[order.status];
    if (!message) {
      return false;
    }

    const trackingUrl = `${this.frontendUrl}/order/${order.id}?token=${order.publicTrackingToken}`;
    const html = this.renderStatusUpdateEmail(
      order,
      restaurant,
      message,
      trackingUrl,
    );

    return this.sendEmail({
      from: `${restaurant.name} <${this.fromEmail}>`,
      to: order.customerEmail,
      subject: `${message} - ${order.orderNumber}`,
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
    } catch (error: any) {
      this.logger.error(`Error sending email: ${error.message}`);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Templates HTML
  // ─────────────────────────────────────────────────────────────

  private renderOrderConfirmationEmail(
    order: OrderData,
    restaurant: RestaurantData,
    trackingUrl: string,
  ): string {
    const itemsHtml = order.items
      .map(
        (item) => `
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
          <span>${item.quantity}x ${item.name}</span>
          <span>$${this.formatPrice(item.unitPrice * item.quantity)}</span>
        </div>
        ${item.notes ? `<p style="color:#64748b;margin:0 0 10px;font-size:14px;">📝 ${item.notes}</p>` : ''}
      `,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f1f5f9; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: white; padding: 30px; border: 1px solid #e2e8f0; }
    .total-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
    .total { font-size: 24px; font-weight: bold; color: #10b981; }
    .btn { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; background: #f8fafc; border-radius: 0 0 12px 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; font-size: 28px;">✅ ¡Pedido Confirmado!</h1>
      <p style="margin:10px 0 0; font-size: 18px;">Pedido #${order.orderNumber}</p>
    </div>
    
    <div class="content">
      <p style="font-size: 16px;">Hola <strong>${order.customerName}</strong>,</p>
      <p style="font-size: 16px; color: #475569;">Tu pedido en <strong>${restaurant.name}</strong> ha sido confirmado y pagado exitosamente.</p>
      
      <h3 style="margin-top: 24px; color: #1e293b;">📦 Resumen del Pedido</h3>
      ${itemsHtml}
      
      <div class="total-row">
        <span>Subtotal</span>
        <span>$${this.formatPrice(order.subtotal)}</span>
      </div>
      
      ${
        order.deliveryFee > 0
          ? `
      <div class="total-row">
        <span>Envío</span>
        <span>$${this.formatPrice(order.deliveryFee)}</span>
      </div>
      `
          : ''
      }
      
      ${
        order.tip > 0
          ? `
      <div class="total-row">
        <span>Propina</span>
        <span>$${this.formatPrice(order.tip)}</span>
      </div>
      `
          : ''
      }
      
      <div class="total-row" style="border:none; padding-top: 15px;">
        <span class="total">Total</span>
        <span class="total">$${this.formatPrice(order.total)}</span>
      </div>
      
      <h3 style="margin-top: 24px; color: #1e293b;">🚚 Método de Entrega</h3>
      <p style="color: #475569;">
        ${
          order.type === 'DELIVERY'
            ? `<strong>Delivery a:</strong> ${order.deliveryAddress}${order.deliveryNotes ? `<br><em>Notas: ${order.deliveryNotes}</em>` : ''}`
            : order.type === 'PICKUP'
              ? '<strong>Retiro en local</strong>'
              : '<strong>Consumo en local</strong>'
        }
      </p>
      
      <div style="text-align:center; margin-top:30px;">
        <a href="${trackingUrl}" class="btn">📍 Seguir mi pedido</a>
      </div>
    </div>
    
    <div class="footer">
      <p style="margin: 5px 0;"><strong>${restaurant.name}</strong></p>
      <p style="margin: 5px 0;">${restaurant.address}</p>
      <p style="margin: 5px 0;">📞 ${restaurant.phone}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  private renderNewOrderEmail(
    order: OrderData,
    restaurant: RestaurantData,
  ): string {
    const itemsHtml = order.items
      .map(
        (item) => `
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
          <span><strong>${item.quantity}x</strong> ${item.name}</span>
          <span>$${this.formatPrice(item.unitPrice * item.quantity)}</span>
        </div>
        ${item.notes ? `<p style="color:#64748b;margin:0 0 10px;font-size:14px;">📝 ${item.notes}</p>` : ''}
      `,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f1f5f9; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: white; padding: 30px; border: 1px solid #e2e8f0; }
    .urgent { background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .total { font-size: 24px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; font-size: 28px;">🆕 ¡Nuevo Pedido!</h1>
      <p style="margin:10px 0 0; font-size: 18px;">#${order.orderNumber}</p>
    </div>
    
    <div class="content">
      <div class="urgent">
        <strong>⏰ Nuevo pedido pagado</strong>
        <p style="margin:5px 0 0;">Revisar y confirmar lo antes posible</p>
      </div>
      
      <h3 style="color: #1e293b;">👤 Cliente</h3>
      <p style="color: #475569;">
        <strong>${order.customerName}</strong><br>
        ${order.customerEmail ? `📧 ${order.customerEmail}<br>` : ''}
        📱 ${order.customerPhone}
      </p>
      
      <h3 style="color: #1e293b;">📦 Items</h3>
      ${itemsHtml}
      
      <div style="display: flex; justify-content: space-between; padding: 15px 0; border: none;">
        <span class="total">💰 Total</span>
        <span class="total">$${this.formatPrice(order.total)}</span>
      </div>
      
      <h3 style="color: #1e293b;">🚚 Entrega</h3>
      <p style="color: #475569;">
        ${
          order.type === 'DELIVERY'
            ? `<strong>Delivery</strong><br>${order.deliveryAddress}${order.deliveryNotes ? `<br>📝 ${order.deliveryNotes}` : ''}`
            : order.type === 'PICKUP'
              ? '<strong>Retiro en local</strong>'
              : '<strong>Consumo en local</strong>'
        }
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  private renderStatusUpdateEmail(
    order: OrderData,
    restaurant: RestaurantData,
    message: string,
    trackingUrl: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f1f5f9; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; text-align: center; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .status { font-size: 64px; margin: 20px 0; }
    .message { font-size: 24px; color: #1e293b; font-weight: 600; }
    .order-number { color: #64748b; font-size: 16px; margin-top: 10px; }
    .btn { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="status">
        ${this.getStatusEmoji(order.status)}
      </div>
      <p class="message">${message}</p>
      <p class="order-number">Pedido #${order.orderNumber}</p>
      <a href="${trackingUrl}" class="btn">Ver estado del pedido</a>
    </div>
    <p style="color:#64748b; margin-top: 20px; font-size: 14px;">${restaurant.name}</p>
  </div>
</body>
</html>
    `;
  }

  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      PENDING: '⏳',
      PAID: '💳',
      CONFIRMED: '👨‍🍳',
      PREPARING: '🔥',
      READY: '✅',
      DELIVERED: '🎉',
      CANCELLED: '❌',
    };
    return emojis[status] || '📦';
  }

  private formatPrice(amount: number): string {
    return Number(amount).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
