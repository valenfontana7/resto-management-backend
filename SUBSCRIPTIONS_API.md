# 💳 API de Suscripciones

## Resumen

Sistema de suscripciones con 3 planes, integración con MercadoPago y gestión de trials.

## Planes Disponibles

| Plan             | Precio      | Features                                                              |
| ---------------- | ----------- | --------------------------------------------------------------------- |
| **Starter**      | Gratis      | Menú digital, QR, pedidos básicos, branding                           |
| **Professional** | $15.000/mes | Todo de Starter + productos ilimitados, reservas, analytics, WhatsApp |
| **Enterprise**   | $35.000/mes | Todo de Professional + multi-sucursal, delivery, integraciones        |

## Estados de Suscripción

- `TRIALING` - En período de prueba (14 días)
- `ACTIVE` - Activa y pagando
- `PAST_DUE` - Pago vencido (gracia de 3 días)
- `CANCELED` - Cancelada por el usuario
- `EXPIRED` - Expirada (trial o pago no renovado)

---

## Endpoints

### Base URL: `/api/restaurants/:restaurantId/subscription`

---

### 1. Obtener Suscripción Actual

```http
GET /api/restaurants/:restaurantId/subscription
Authorization: Bearer {token}
```

**Response 200:**

```json
{
  "subscription": {
    "id": "clxxx...",
    "restaurantId": "clyyy...",
    "planType": "PROFESSIONAL",
    "status": "TRIALING",
    "currentPeriodStart": "2026-01-09T00:00:00.000Z",
    "currentPeriodEnd": "2026-01-23T00:00:00.000Z",
    "trialStart": "2026-01-09T00:00:00.000Z",
    "trialEnd": "2026-01-23T00:00:00.000Z",
    "canceledAt": null,
    "cancelAtPeriodEnd": false,
    "paymentMethodId": null,
    "lastPaymentDate": null,
    "nextPaymentDate": "2026-01-23T00:00:00.000Z",
    "createdAt": "2026-01-09T00:00:00.000Z",
    "updatedAt": "2026-01-09T00:00:00.000Z",
    "invoices": [],
    "paymentMethods": []
  }
}
```

---

### 2. Obtener Resumen de Suscripción

```http
GET /api/restaurants/:restaurantId/subscription/summary
Authorization: Bearer {token}
```

**Response 200:**

```json
{
  "subscription": { ... },
  "trialDaysRemaining": 12,
  "isTrialing": true,
  "canUpgrade": true,
  "canDowngrade": false,
  "nextBillingDate": "2026-01-23T00:00:00.000Z",
  "nextBillingAmount": 1500000
}
```

---

### 3. Crear Suscripción

```http
POST /api/restaurants/:restaurantId/subscription
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "planType": "PROFESSIONAL"
}
```

**Valores permitidos para `planType`:**

- `STARTER` - Plan gratuito (sin trial)
- `PROFESSIONAL` - $15.000/mes (14 días de trial)
- `ENTERPRISE` - $35.000/mes (14 días de trial)

**Response 201:**

```json
{
  "subscription": { ... },
  "checkoutUrl": null
}
```

---

### 4. Crear Checkout de MercadoPago

```http
POST /api/restaurants/:restaurantId/subscription/checkout
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "planType": "PROFESSIONAL",
  "successUrl": "https://app.restoo.com.ar/admin/subscription?success=true",
  "cancelUrl": "https://app.restoo.com.ar/admin/subscription?canceled=true"
}
```

**Response 200:**

```json
{
  "checkoutUrl": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "preferenceId": "pref_123456"
}
```

---

### 5. Actualizar Plan (Upgrade/Downgrade)

```http
PATCH /api/restaurants/:restaurantId/subscription
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "planType": "ENTERPRISE"
}
```

**Response 200:**

```json
{
  "subscription": { ... },
  "message": "Plan actualizado. El cambio se aplicó inmediatamente."
}
```

---

### 6. Cancelar Suscripción

```http
POST /api/restaurants/:restaurantId/subscription/cancel
Authorization: Bearer {token}
```

**Response 200:**

```json
{
  "subscription": { ... },
  "message": "Suscripción cancelada. Tendrás acceso hasta el 23 de enero de 2026."
}
```

---

### 7. Reactivar Suscripción

```http
POST /api/restaurants/:restaurantId/subscription/reactivate
Authorization: Bearer {token}
```

**Response 200:**

```json
{
  "subscription": { ... },
  "message": "Suscripción reactivada exitosamente."
}
```

---

### 8. Obtener Facturas

```http
GET /api/restaurants/:restaurantId/subscription/invoices
Authorization: Bearer {token}
```

**Response 200:**

```json
{
  "invoices": [
    {
      "id": "clzzz...",
      "subscriptionId": "clxxx...",
      "amount": 1500000,
      "currency": "ARS",
      "status": "paid",
      "mpPaymentId": "12345678",
      "invoiceUrl": null,
      "invoicePdf": null,
      "paidAt": "2026-01-09T00:05:00.000Z",
      "createdAt": "2026-01-09T00:00:00.000Z"
    }
  ]
}
```

---

## Webhook de MercadoPago

### Endpoint para pagos de suscripción

```http
POST /api/webhooks/mercadopago/subscription
```

Este endpoint es llamado automáticamente por MercadoPago cuando:

- Se aprueba un pago → La suscripción se activa
- Se rechaza un pago → La suscripción pasa a `PAST_DUE`

---

## Guard de Features

Para proteger endpoints que requieren features específicas:

```typescript
import { RequireFeature, FeatureGuard } from '../subscriptions/guards';
import { UseGuards } from '@nestjs/common';

@Get('analytics')
@UseGuards(FeatureGuard)
@RequireFeature('analytics')
async getAnalytics() {
  // Solo accesible para planes PROFESSIONAL o ENTERPRISE
}
```

### Features disponibles por plan

**Starter:**

- `menu_digital`
- `qr_code`
- `basic_orders`
- `branding`

**Professional:** (todo de Starter +)

- `unlimited_products`
- `reservations`
- `kitchen_display`
- `analytics`
- `whatsapp_integration`

**Enterprise:** (todo de Professional +)

- `multi_branch`
- `delivery_integration`
- `pedidosya_rappi`
- `custom_api`

---

## Errores Comunes

| Código | Error                                | Descripción                                       |
| ------ | ------------------------------------ | ------------------------------------------------- |
| 400    | `Plan gratuito no requiere checkout` | Se intentó crear checkout para plan Starter       |
| 404    | `No existe suscripción`              | El restaurante no tiene suscripción               |
| 409    | `Ya existe suscripción activa`       | Se intentó crear suscripción cuando ya existe una |
| 403    | `Feature no disponible`              | El plan actual no incluye la feature requerida    |

---

## Cron Jobs Automáticos

| Job                             | Frecuencia   | Descripción                                           |
| ------------------------------- | ------------ | ----------------------------------------------------- |
| `checkExpiredTrials`            | Cada hora    | Marca trials expirados como `EXPIRED`                 |
| `sendTrialExpiringReminders`    | 10:00 diario | Envía avisos 3 y 1 día antes de expirar trial         |
| `processMonthlyRenewals`        | 00:05 diario | Procesa renovaciones de suscripciones                 |
| `finalizeCanceledSubscriptions` | 00:10 diario | Finaliza suscripciones canceladas al terminar período |

---

## Variables de Entorno Requeridas

```env
# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxx
MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxx

# URLs
BACKEND_URL=https://api.restoo.com.ar
FRONTEND_URL=https://app.restoo.com.ar

# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=facturacion@restoo.com.ar
```

---

## 📧 Emails Transaccionales

El sistema envía automáticamente los siguientes emails:

| Email                          | Trigger                        | Método                               |
| ------------------------------ | ------------------------------ | ------------------------------------ |
| **Bienvenida Trial**           | Al crear suscripción con trial | `sendWelcomeTrialEmail()`            |
| **Trial por expirar (3 días)** | Cron diario a las 10:00        | `sendTrialEndingEmail()`             |
| **Trial por expirar (1 día)**  | Cron diario a las 10:00        | `sendTrialEndingEmail()`             |
| **Trial expirado**             | Cron cada hora                 | `sendTrialExpiredEmail()`            |
| **Pago exitoso**               | Webhook de MercadoPago         | `sendPaymentSuccessEmail()`          |
| **Pago fallido**               | Webhook de MercadoPago         | `sendPaymentFailedEmail()`           |
| **Suscripción cancelada**      | Endpoint `/cancel`             | `sendSubscriptionCanceledEmail()`    |
| **Suscripción reactivada**     | Endpoint `/reactivate`         | `sendSubscriptionReactivatedEmail()` |
| **Plan mejorado**              | Endpoint PATCH (upgrade)       | `sendPlanUpgradedEmail()`            |
| **Plan reducido**              | Endpoint PATCH (downgrade)     | `sendPlanDowngradedEmail()`          |
