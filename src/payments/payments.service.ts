import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  private client: MercadoPagoConfig;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );

    if (!accessToken) {
      console.warn('MercadoPago access token not configured');
    } else {
      this.client = new MercadoPagoConfig({
        accessToken,
      });
    }
  }

  async createPreference(orderId: string) {
    if (!this.client) {
      throw new BadRequestException('MercadoPago not configured');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        restaurant: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    const preference = new Preference(this.client);

    const items = order.items.map((item) => ({
      id: item.dish.id,
      title: item.dish.name,
      description: item.dish.description || '',
      quantity: item.quantity,
      unit_price: item.unitPrice / 100, // Convertir de centavos a pesos
      currency_id: 'ARS',
    }));

    const backUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const preferenceData = {
      items,
      back_urls: {
        success: `${backUrl}/payment/success`,
        failure: `${backUrl}/payment/failure`,
        pending: `${backUrl}/payment/pending`,
      },
      auto_return: 'approved' as const,
      external_reference: orderId,
      notification_url: `${this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000'}/api/payments/webhook`,
      payer: {
        name: order.customerName,
        email: order.customerEmail || '',
        phone: {
          number: order.customerPhone,
        },
      },
      metadata: {
        order_id: orderId,
        restaurant_id: order.restaurantId,
      },
    };

    const response = await preference.create({ body: preferenceData });

    // Actualizar orden con el preference ID
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        preferenceId: response.id,
      },
    });

    return {
      preferenceId: response.id,
      initPoint: response.init_point,
      sandboxInitPoint: response.sandbox_init_point,
    };
  }

  async handleWebhook(body: any) {
    const { type, data } = body;

    if (type === 'payment') {
      const paymentId = data.id;

      const payment = new Payment(this.client);
      const paymentInfo = await payment.get({ id: paymentId });

      const orderId = paymentInfo.external_reference;

      if (!orderId) {
        console.error('No order ID in payment');
        return;
      }

      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        console.error('Order not found:', orderId);
        return;
      }

      // Actualizar estado del pago según el estado de MercadoPago
      let paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' = 'PENDING';
      let orderStatus = order.status;

      switch (paymentInfo.status) {
        case 'approved':
          paymentStatus = 'PAID';
          orderStatus = 'CONFIRMED';
          break;
        case 'rejected':
        case 'cancelled':
          paymentStatus = 'FAILED';
          break;
        case 'refunded':
          paymentStatus = 'REFUNDED';
          orderStatus = 'CANCELLED';
          break;
        default:
          paymentStatus = 'PENDING';
      }

      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentId: paymentId.toString(),
          paymentStatus,
          status: orderStatus,
        },
      });

      // Crear historial de estado si cambió
      if (orderStatus !== order.status) {
        await this.prisma.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status as any,
            toStatus: orderStatus as any,
            changedBy: 'mercadopago',
            notes: `Payment ${paymentInfo.status}`,
          },
        });
      }
    }

    return { received: true };
  }

  async getPaymentStatus(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        paymentStatus: true,
        paymentId: true,
        preferenceId: true,
        status: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    return order;
  }
}
