/**
 * Payment Provider Abstraction Layer
 *
 * Interfaz agnóstica para todos los proveedores de pago (MercadoPago, Payway, etc.).
 * Cada proveedor implementa esta interfaz y se registra en el PaymentProviderFactory.
 *
 * Montos: siempre en CENTAVOS (ej. $1500.00 = 150000 centavos).
 */

// ─── Tipos compartidos ───────────────────────────────────────────────

export type PaymentProviderName = 'mercadopago' | 'payway';

export interface PaymentProviderConfig {
  provider: PaymentProviderName;
  publicKey?: string;
  secretKey: string;
  merchantId?: string;
  siteId?: string;
  isSandbox: boolean;
  metadata?: Record<string, unknown>;
}

// ─── Checkout / Preference ───────────────────────────────────────────

export interface CreateCheckoutInput {
  orderId: string;
  restaurantId: string;
  items: CheckoutItem[];
  customer: CheckoutCustomer;
  /** Monto total en centavos */
  totalAmount: number;
  currency: string;
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  notificationUrl: string;
  externalReference: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutItem {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  /** Precio unitario en centavos */
  unitPrice: number;
}

export interface CheckoutCustomer {
  name: string;
  email?: string;
  phone?: string;
  document?: { type: string; number: string };
}

export interface CheckoutResult {
  /** ID de la preference/sesión en el proveedor */
  providerSessionId: string;
  /** URL para redirigir al cliente */
  checkoutUrl: string;
  /** URL de sandbox (si aplica) */
  sandboxCheckoutUrl?: string;
  /** Datos extra del proveedor */
  raw?: Record<string, unknown>;
}

// ─── Pago con tarjeta guardada (suscripciones) ──────────────────────

export interface ChargeInput {
  /** Monto en centavos */
  amount: number;
  currency: string;
  description: string;
  customerId: string;
  paymentMethodToken: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ChargeResult {
  providerPaymentId: string;
  status:
    | 'approved'
    | 'pending'
    | 'rejected'
    | 'in_process'
    | 'refunded'
    | 'cancelled';
  statusDetail: string;
  /** Monto cobrado en centavos */
  amount: number;
  raw?: Record<string, unknown>;
}

// ─── Customer / Tarjetas ─────────────────────────────────────────────

export interface CreateCustomerInput {
  email?: string;
  name?: string;
  document?: { type: string; number: string };
  metadata?: Record<string, unknown>;
}

export interface CreateCustomerResult {
  customerId: string;
  raw?: Record<string, unknown>;
}

export interface SaveCardInput {
  customerId: string;
  token: string;
  metadata?: Record<string, unknown>;
}

export interface SavedCard {
  cardId: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName?: string;
  issuerId?: string;
  issuerName?: string;
}

// ─── Webhook ─────────────────────────────────────────────────────────

export interface WebhookValidationInput {
  headers: Record<string, string>;
  rawBody: Buffer | string;
  query?: Record<string, string>;
}

export interface WebhookPayload {
  eventType: 'payment' | 'refund' | 'chargeback' | 'other';
  providerPaymentId: string;
  externalReference?: string;
  status: 'approved' | 'pending' | 'rejected' | 'refunded' | 'cancelled';
  /** Monto en centavos */
  amount?: number;
  raw: Record<string, unknown>;
}

// ─── Reembolsos ──────────────────────────────────────────────────────

export interface RefundInput {
  providerPaymentId: string;
  /** Monto a reembolsar en centavos (null = total) */
  amount?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RefundResult {
  refundId: string;
  status: 'approved' | 'pending' | 'rejected';
  amount: number;
  raw?: Record<string, unknown>;
}

// ─── Interfaz principal del proveedor ────────────────────────────────

export interface IPaymentProvider {
  readonly name: PaymentProviderName;

  /** Crear una sesión de checkout (redirect al gateway) */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;

  /** Cobrar con tarjeta guardada (para renovaciones de suscripción) */
  chargeWithSavedCard(input: ChargeInput): Promise<ChargeResult>;

  /** Crear customer en el proveedor */
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;

  /** Guardar tarjeta asociada a un customer */
  saveCard(input: SaveCardInput): Promise<SavedCard>;

  /** Listar tarjetas de un customer */
  listCards(customerId: string): Promise<SavedCard[]>;

  /** Eliminar tarjeta */
  deleteCard(customerId: string, cardId: string): Promise<void>;

  /** Validar webhook y extraer datos normalizados */
  validateAndParseWebhook(
    input: WebhookValidationInput,
  ): Promise<WebhookPayload>;

  /** Reembolso total o parcial */
  refund(input: RefundInput): Promise<RefundResult>;

  /** Consultar estado de un pago */
  getPaymentStatus(providerPaymentId: string): Promise<{
    status: 'approved' | 'pending' | 'rejected' | 'refunded' | 'cancelled';
    statusDetail: string;
    amount: number;
    raw?: Record<string, unknown>;
  }>;
}
