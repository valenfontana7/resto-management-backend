import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { randomUUID } from 'crypto';

const DEFAULT_ACTIVATION_AMOUNT_ARS = 79_000;

function parseActivationAmountArs(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_ACTIVATION_AMOUNT_ARS;

  const digits = raw.replace(/[^\d]/g, '');
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) {
    return DEFAULT_ACTIVATION_AMOUNT_ARS;
  }
  return amount;
}

@Injectable()
export class ImpulsaCheckoutService {
  private readonly logger = new Logger(ImpulsaCheckoutService.name);
  private readonly mp: MercadoPagoConfig | null;

  constructor(private readonly configService: ConfigService) {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    this.mp = accessToken ? new MercadoPagoConfig({ accessToken }) : null;
  }

  /**
   * Preferencia de pago para Activación local (Impulsa).
   * Usa el mismo MERCADOPAGO_ACCESS_TOKEN de plataforma que el checkout de suscripción Bentoo.
   */
  async createCheckout(): Promise<{
    checkoutUrl: string;
    preferenceId: string;
    amountArs: number;
    paymentProvider: 'mercadopago';
  }> {
    const staticCheckoutUrl = (
      this.configService.get<string>('IMPULSA_MP_CHECKOUT_URL') ?? ''
    ).trim();
    if (/^https:\/\//i.test(staticCheckoutUrl)) {
      return {
        checkoutUrl: staticCheckoutUrl,
        preferenceId: 'static',
        amountArs: this.resolveActivationAmountArs(),
        paymentProvider: 'mercadopago',
      };
    }

    if (!this.mp) {
      throw new ServiceUnavailableException(
        'MercadoPago de plataforma no está configurado (MERCADOPAGO_ACCESS_TOKEN)',
      );
    }

    const amountArs = this.resolveActivationAmountArs();
    const frontendBase = this.resolveFrontendBase();
    const externalRef = `impulsa_${randomUUID()}`;

    const backUrls: Record<string, string> = {
      success: `${frontendBase}/impulsa?pago=ok`,
      failure: `${frontendBase}/impulsa?pago=error`,
      pending: `${frontendBase}/impulsa?pago=pending`,
    };

    const preferenceData: any = {
      body: {
        items: [
          {
            id: 'impulsa_activation',
            title: 'Bentoo Impulsa - Activación local',
            description:
              'Activación local: Google, redes y QR hacia el canal directo de Bentoo',
            quantity: 1,
            currency_id: 'ARS',
            unit_price: amountArs,
          },
        ],
        back_urls: backUrls,
        external_reference: externalRef,
        metadata: {
          type: 'impulsa_activation',
          product: 'impulsa',
        },
        statement_descriptor: 'BENTOO IMPULSA',
      },
    };

    if (/^https:\/\//i.test(frontendBase)) {
      preferenceData.body.auto_return = 'approved';
    }

    const preference = new Preference(this.mp);
    this.logger.log(
      `Creando preferencia Impulsa amountArs=${amountArs} ref=${externalRef}`,
    );

    const result = await preference.create(preferenceData);
    const checkoutUrl = result.init_point?.trim();
    const preferenceId = result.id?.trim();

    if (!checkoutUrl || !preferenceId) {
      throw new BadRequestException(
        'MercadoPago no devolvió init_point para Impulsa',
      );
    }

    return {
      checkoutUrl,
      preferenceId,
      amountArs,
      paymentProvider: 'mercadopago',
    };
  }

  private resolveActivationAmountArs(): number {
    return parseActivationAmountArs(
      this.configService.get<string>('IMPULSA_ACTIVATION_AMOUNT_ARS') ??
        this.configService.get<string>('IMPULSA_ACTIVATION_PRICE'),
    );
  }

  private resolveFrontendBase(): string {
    const frontend =
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      this.configService.get<string>('BASE_URL')?.trim() ||
      'http://localhost:3000';
    return frontend.replace(/\/$/, '');
  }
}
