import { Injectable } from '@nestjs/common';

export interface PaymentDiscountResult {
  paymentMethodDiscount: number;
  discountPercent: number;
  subtotal: number;
}

@Injectable()
export class FloorDiscountService {
  /**
   * Lee descuentos por medio de pago desde businessRules.payment.methodDiscounts
   * Ejemplo: { "cash": 10, "bank-transfer": 5 }
   */
  getMethodDiscountPercent(
    businessRules: unknown,
    paymentMethod: string,
  ): number {
    const rules = this.asRecord(businessRules);
    const payment = this.asRecord(rules?.payment);
    const methodDiscounts = this.asRecord(payment?.methodDiscounts);
    const normalized = this.normalizePaymentMethod(paymentMethod);
    const raw = methodDiscounts?.[normalized];
    const percent = Number(raw);
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    return Math.min(100, Math.round(percent));
  }

  applyPaymentMethodDiscount(
    subtotal: number,
    businessRules: unknown,
    paymentMethod: string,
  ): PaymentDiscountResult {
    const discountPercent = this.getMethodDiscountPercent(
      businessRules,
      paymentMethod,
    );
    const paymentMethodDiscount = Math.round(
      (subtotal * discountPercent) / 100,
    );
    return {
      paymentMethodDiscount,
      discountPercent,
      subtotal,
    };
  }

  normalizePaymentMethod(method: string): string {
    const value = String(method || '')
      .trim()
      .toLowerCase();
    const aliases: Record<string, string> = {
      cash: 'cash',
      efectivo: 'cash',
      'debit-card': 'debit-card',
      debit: 'debit-card',
      'credit-card': 'credit-card',
      credit: 'credit-card',
      'bank-transfer': 'bank-transfer',
      transfer: 'bank-transfer',
      mercadopago: 'mercadopago',
    };
    return aliases[value] ?? value;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
