import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentProviderFactory } from '../../payment-providers/payment-provider.factory';
import { PaymentProviderName } from '../../payment-providers/interfaces';
import { OrdersService } from '../orders.service';
import { PaymentStatus } from '../dto/order.dto';
import { PaymentBusinessEventsService } from '../../business-events/publishers/payment-business-events.service';
import { MercadoPagoCredentialsService } from '../../mercadopago/mercadopago-credentials.service';

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
    private readonly paymentEvents: PaymentBusinessEventsService,
    private readonly mpCredentials: MercadoPagoCredentialsService,
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
        total: true,
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
    total: number;
  }): Promise<void> {
    if (!session.preferenceId) return;

    const providerName = this.normalizeProviderName(session.paymentProvider);
    if (!providerName) return;

    if (providerName === 'mercadopago') {
      await this.reconcileMercadoPago(session);
      return;
    }

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
      await this.markCheckoutFailed(session, status.status);
    }
  }

  private async reconcileMercadoPago(session: {
    id: string;
    restaurantId: string;
    preferenceId: string | null;
    total: number;
  }): Promise<void> {
    const accessToken = await this.mpCredentials.getDecryptedToken(
      session.restaurantId,
    );
    if (!accessToken) {
      this.logger.warn(
        `Checkout ${session.id}: sin credencial MP del tenant — no se reconcilia`,
      );
      return;
    }

    const payment = await this.findLatestPaymentForCheckout(
      session.id,
      accessToken,
    );
    if (!payment?.id) return;

    const status = String(payment.status ?? '').toLowerCase();
    if (status === 'approved') {
      await this.ordersService.processCheckoutPaymentApproved(
        session.id,
        String(payment.id),
      );
      this.logger.log(
        `Checkout ${session.id} reconciliado como APPROVED (provider=mercadopago, paymentId=${payment.id})`,
      );
      return;
    }

    if (status === 'rejected' || status === 'cancelled') {
      await this.markCheckoutFailed(session, status);
    }
  }

  /**
   * Busca el pago más reciente de MP ligado al checkout (external_reference).
   */
  private async findLatestPaymentForCheckout(
    checkoutSessionId: string,
    accessToken: string,
  ): Promise<any> {
    const url = new URL('https://api.mercadopago.com/v1/payments/search');
    url.searchParams.set('external_reference', checkoutSessionId);
    url.searchParams.set('sort', 'date_created');
    url.searchParams.set('criteria', 'desc');
    url.searchParams.set('limit', '5');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      this.logger.warn(
        `MP payments/search failed for ${checkoutSessionId}: ${response.status} ${details.slice(0, 200)}`,
      );
      return null;
    }

    const json = (await response.json().catch(() => null)) as {
      results?: any[];
    } | null;
    const results = Array.isArray(json?.results) ? json.results : [];
    return results[0] ?? null;
  }

  private async markCheckoutFailed(
    session: { id: string; restaurantId: string; total: number },
    reason: string,
  ): Promise<void> {
    await this.prisma.checkoutSession.update({
      where: { id: session.id },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    this.paymentEvents.publishPaymentFailed({
      restaurantId: session.restaurantId,
      checkoutSessionId: session.id,
      amount: session.total,
      reason,
      source: 'payment-reconciliation',
    });
    this.logger.log(`Checkout ${session.id} reconciliado como ${reason}`);
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
