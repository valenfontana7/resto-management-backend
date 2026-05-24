import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentProviderFactory } from '../../payment-providers/payment-provider.factory';
import { PaymentProviderName } from '../../payment-providers/interfaces';
import { OrdersService } from '../orders.service';
import { PaymentStatus } from '../dto/order.dto';

/**
 * Cron de conciliación de pagos online.
 *
 * Los webhooks pueden perderse (timeouts, restart del backend, problemas de
 * red en el proveedor). Este servicio recorre periódicamente las
 * CheckoutSession en estado PENDING con preferenceId asignado y consulta el
 * estado real al proveedor. Si está aprobado, promueve el checkout a Order.
 *
 * Ventana de reconciliación: pagos creados entre 5 minutos y 24 horas atrás.
 * - <5min: dar tiempo a que el webhook llegue de forma normal.
 * - >24h: asumir abandono, ignorar para no consultar indefinidamente.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private readonly maxAgeMinutes = 24 * 60;
  private readonly minAgeMinutes = 5;
  private readonly batchSize = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly ordersService: OrdersService,
  ) {}

  @Cron('*/5 * * * *')
  async reconcilePendingCheckouts(): Promise<void> {
    const now = Date.now();
    const lowerBound = new Date(now - this.maxAgeMinutes * 60_000);
    const upperBound = new Date(now - this.minAgeMinutes * 60_000);

    const pending = await this.prisma.checkoutSession.findMany({
      where: {
        paymentStatus: PaymentStatus.PENDING,
        preferenceId: { not: null },
        createdAt: { gte: lowerBound, lte: upperBound },
      },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
      select: {
        id: true,
        restaurantId: true,
        preferenceId: true,
        paymentProvider: true,
      },
    });

    if (pending.length === 0) return;

    this.logger.log(
      `Reconciliando ${pending.length} CheckoutSession(es) pendientes`,
    );

    for (const session of pending) {
      try {
        await this.reconcileOne(session);
      } catch (error: any) {
        this.logger.warn(
          `Error reconciliando checkout ${session.id}: ${error?.message}`,
        );
      }
    }
  }

  private async reconcileOne(session: {
    id: string;
    restaurantId: string;
    preferenceId: string | null;
    paymentProvider: string;
  }): Promise<void> {
    if (!session.preferenceId) return;

    const providerName = this.normalizeProviderName(session.paymentProvider);
    if (!providerName) return;

    // Solo Payway hoy: MP tiene su propio polling/webhook flow distinto.
    if (providerName !== 'payway') return;

    let provider;
    try {
      const resolved =
        await this.paymentProviderFactory.getProviderForRestaurant(
          session.restaurantId,
          providerName,
        );
      provider = resolved.provider;
    } catch {
      // Sin credenciales activas → no podemos consultar
      return;
    }

    if (!provider.getPaymentStatus) return;

    const status = await provider.getPaymentStatus(session.preferenceId);

    if (status.status === 'approved') {
      await this.ordersService.processCheckoutPaymentApproved(
        session.id,
        session.preferenceId,
      );
      this.logger.log(
        `Checkout ${session.id} reconciliado como APPROVED (provider=${providerName})`,
      );
    } else if (status.status === 'rejected' || status.status === 'cancelled') {
      await this.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      this.logger.log(
        `Checkout ${session.id} reconciliado como ${status.status}`,
      );
    }
  }

  private normalizeProviderName(value: string): PaymentProviderName | null {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'mercadopago') return 'mercadopago';
    if (normalized === 'payway') return 'payway';
    return null;
  }
}
