import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { ImpulsaCheckoutService } from './impulsa-checkout.service';

describe('ImpulsaCheckoutService', () => {
  const build = (env: Record<string, string | undefined>) => {
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;
    return new ImpulsaCheckoutService(config);
  };

  it('devuelve URL estática cuando IMPULSA_MP_CHECKOUT_URL está configurada', async () => {
    const service = build({
      IMPULSA_MP_CHECKOUT_URL:
        'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=abc',
      IMPULSA_ACTIVATION_AMOUNT_ARS: '79000',
    });

    await expect(service.createCheckout()).resolves.toEqual({
      checkoutUrl:
        'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=abc',
      preferenceId: 'static',
      amountArs: 79000,
      paymentProvider: 'mercadopago',
    });
  });

  it('falla si no hay token de plataforma ni URL estática', async () => {
    const service = build({});
    await expect(service.createCheckout()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
