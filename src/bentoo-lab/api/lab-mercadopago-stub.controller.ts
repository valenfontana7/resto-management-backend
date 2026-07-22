import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * HITL Lab: las preference stubs apuntan aquí (sin red a MercadoPago).
 * Solo opera con BENTOO_RUNTIME_MODE=lab.
 */
@Public()
@Controller('api/lab/mercadopago')
export class LabMercadoPagoStubController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Get('preferences/:preferenceId')
  approvePreference(@Param('preferenceId') preferenceId: string) {
    return this.approveSynthetic(preferenceId);
  }

  @Get('sandbox/:preferenceId')
  approveSandboxPreference(@Param('preferenceId') preferenceId: string) {
    return this.approveSynthetic(preferenceId);
  }

  private async approveSynthetic(preferenceId: string) {
    if (!isLabRuntime()) {
      throw new ServiceUnavailableException(
        'Stub MercadoPago Lab solo disponible en runtime Lab',
      );
    }

    const checkoutSessionId = preferenceId.startsWith('lab-pref-')
      ? preferenceId.slice('lab-pref-'.length)
      : '';
    if (!checkoutSessionId) {
      throw new NotFoundException('Preferencia Lab inválida');
    }

    const checkout = await this.prisma.checkoutSession.findUnique({
      where: { id: checkoutSessionId },
      select: { id: true, preferenceId: true, paymentStatus: true },
    });
    if (!checkout || checkout.preferenceId !== preferenceId) {
      throw new NotFoundException(
        'Checkout Lab no encontrado para preferencia',
      );
    }

    const paymentId = `lab-pay-${checkoutSessionId}`;
    const order = await this.orders.processCheckoutPaymentApproved(
      checkoutSessionId,
      paymentId,
    );

    return {
      ok: true,
      mode: 'lab-stub',
      preferenceId,
      checkoutSessionId,
      paymentId,
      paymentStatus: 'PAID',
      orderId: order?.id ?? checkoutSessionId,
    };
  }
}
