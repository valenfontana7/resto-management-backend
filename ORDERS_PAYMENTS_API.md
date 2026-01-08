# 🛒 API de Pedidos, Pagos y Emails

**Versión:** 2.0  
**Última actualización:** 8 de enero de 2026

---

## 📋 Resumen

Este documento describe los endpoints para el flujo completo de pedidos:

1. **Crear pedidos** con persistencia y número de orden
2. **Integración MercadoPago** multi-tenant
3. **Webhooks** para actualizar estados automáticamente
4. **Emails** de confirmación con Resend
5. **WebSocket** para updates en tiempo real

---

## 🔌 Endpoints

### 1. POST `/api/restaurants/:restaurantId/orders`

**Crear nuevo pedido (público)**

Este endpoint es público y permite crear pedidos desde el menú sin autenticación.

**Request:**

```json
{
  "customerName": "Juan Pérez",
  "customerEmail": "juan@email.com",
  "customerPhone": "+54 11 1234-5678",
  "type": "DELIVERY",
  "deliveryAddress": "Av. Corrientes 1234, CABA",
  "deliveryNotes": "Timbre 2B",
  "paymentMethod": "mercadopago",
  "items": [
    {
      "dishId": "clxxx123",
      "quantity": 2,
      "notes": "Sin aceitunas"
    }
  ],
  "tip": 0
}
```

**Response 201:**

```json
{
  "order": {
    "id": "clyyy456",
    "orderNumber": "OD-20260108-001",
    "status": "PENDING",
    "publicToken": "clzzz789",
    "createdAt": "2026-01-08T15:30:00Z"
  },
  "paymentUrl": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=xxx",
  "publicTrackingToken": "clzzz789"
}
```

---

### 2. GET `/api/restaurants/:restaurantId/orders/:id/public?token={token}`

**Tracking público de pedido**

**Response 200:**

```json
{
  "order": {
    "id": "clyyy456",
    "orderNumber": "OD-20260108-001",
    "status": "PAID",
    "paymentStatus": "PAID",
    "type": "DELIVERY",
    "subtotal": 900000,
    "deliveryFee": 50000,
    "total": 950000,
    "createdAt": "2026-01-08T15:30:00Z",
    "paidAt": "2026-01-08T15:35:00Z",
    "items": [
      {
        "title": "Pizza Muzzarella",
        "quantity": 2,
        "unitPrice": 450000,
        "subtotal": 900000
      }
    ],
    "restaurant": {
      "name": "Pizzería Don José",
      "phone": "+54 11 9999-8888",
      "address": "Av. Santa Fe 1234"
    }
  }
}
```

---

### 3. GET `/api/restaurants/:restaurantId/orders`

**Listar pedidos (admin, requiere auth)**

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `status` | string | Filtrar por estado(s), separados por coma: `PAID,CONFIRMED,PREPARING` |
| `type` | string | `DINE_IN`, `PICKUP`, `DELIVERY` |
| `startDate` | ISO date | Fecha desde |
| `endDate` | ISO date | Fecha hasta |
| `customerPhone` | string | Buscar por teléfono |
| `page` | number | Página (default: 1) |
| `limit` | number | Items por página (default: 50) |

**Response 200:**

```json
{
  "orders": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 127,
    "pages": 3
  },
  "stats": {
    "pending": 2,
    "paid": 5,
    "confirmed": 3,
    "preparing": 4,
    "ready": 2,
    "delivered": 111,
    "cancelled": 0
  }
}
```

---

### 4. PATCH `/api/restaurants/:restaurantId/orders/:orderId/status`

**Actualizar estado de pedido (admin)**

**Request:**

```json
{
  "status": "PREPARING",
  "notes": "Comenzando preparación"
}
```

**Response 200:**

```json
{
  "order": {
    "id": "clyyy456",
    "orderNumber": "OD-20260108-001",
    "status": "PREPARING",
    "preparingAt": "2026-01-08T15:40:00Z",
    "statusHistory": [...]
  }
}
```

**Transiciones de estado válidas:**

- `PENDING` → `PAID`, `CANCELLED`
- `PAID` → `CONFIRMED`, `CANCELLED`
- `CONFIRMED` → `PREPARING`, `CANCELLED`
- `PREPARING` → `READY`, `CANCELLED`
- `READY` → `DELIVERED`, `CANCELLED`

---

### 5. POST `/api/webhooks/mercadopago`

**Webhook de MercadoPago**

Este endpoint recibe notificaciones de MercadoPago cuando un pago cambia de estado.

**Query Parameters (enviados por MP):**

```
?type=payment&data.id=123456789
```

**Request Body:**

```json
{
  "action": "payment.created",
  "api_version": "v1",
  "data": { "id": "123456789" },
  "type": "payment"
}
```

**Response 200:**

```json
{
  "received": true,
  "processed": true,
  "orderId": "clyyy456",
  "status": "approved"
}
```

**Efectos automáticos cuando el pago es aprobado:**

1. ✅ Actualiza estado de la orden a `PAID`
2. 📧 Envía email de confirmación al cliente
3. 📧 Envía notificación al restaurante
4. 📡 Emite evento WebSocket para cocina

---

## 📡 WebSocket

### Conexión

```javascript
import { io } from 'socket.io-client';

const socket = io('wss://tu-backend.com/orders');

// Unirse al canal del restaurante
socket.emit('join-restaurant', { restaurantId: 'xxx' });

// Escuchar nuevos pedidos
socket.on('new-order', (data) => {
  console.log('Nuevo pedido:', data.order);
});

// Escuchar actualizaciones
socket.on('order-update', (data) => {
  console.log('Pedido actualizado:', data.order);
});

// Escuchar confirmación de pago
socket.on('payment-confirmed', (data) => {
  console.log('Pago confirmado:', data.order);
});
```

### Eventos

| Evento              | Descripción                  |
| ------------------- | ---------------------------- |
| `new-order`         | Nuevo pedido pagado recibido |
| `order-update`      | Estado de pedido actualizado |
| `payment-confirmed` | Pago aprobado                |

---

## 📧 Emails

Los emails se envían automáticamente usando [Resend](https://resend.com).

### Tipos de email:

1. **Confirmación de pedido** - Al cliente cuando paga
2. **Notificación de nuevo pedido** - Al restaurante
3. **Actualización de estado** - Al cliente (CONFIRMED, PREPARING, READY, DELIVERED)

### Configuración

```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=pedidos@tu-dominio.com
FRONTEND_URL=https://tu-frontend.com
```

---

## 🏗️ Estados de Pedido

```
PENDING → PAID → CONFIRMED → PREPARING → READY → DELIVERED
   ↓        ↓        ↓           ↓          ↓
CANCELLED  ───────────────────────────────────
```

| Estado      | Descripción                 | Timestamp     |
| ----------- | --------------------------- | ------------- |
| `PENDING`   | Esperando pago              | `createdAt`   |
| `PAID`      | Pagado exitosamente         | `paidAt`      |
| `CONFIRMED` | Confirmado por restaurante  | `confirmedAt` |
| `PREPARING` | En preparación              | `preparingAt` |
| `READY`     | Listo para entregar/retirar | `readyAt`     |
| `DELIVERED` | Entregado                   | `deliveredAt` |
| `CANCELLED` | Cancelado                   | `cancelledAt` |

---

## 🧪 Testing

### Crear pedido

```bash
curl -X POST http://localhost:4000/api/restaurants/REST_ID/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test User",
    "customerEmail": "test@test.com",
    "customerPhone": "+54 11 1234-5678",
    "type": "PICKUP",
    "paymentMethod": "mercadopago",
    "items": [{"dishId": "DISH_ID", "quantity": 1}]
  }'
```

### Simular webhook

```bash
curl -X POST "http://localhost:4000/api/webhooks/mercadopago?type=payment&data.id=123456" \
  -H "Content-Type: application/json" \
  -d '{"type": "payment", "data": {"id": "123456"}}'
```

### Actualizar estado

```bash
curl -X PATCH http://localhost:4000/api/restaurants/REST_ID/orders/ORDER_ID/status \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "PREPARING"}'
```

---

## 📋 Checklist de Implementación

### Backend

- [x] Schema Prisma actualizado con `orderNumber`, timestamps
- [x] Enum `OrderStatus` con `PAID`
- [x] Módulo Orders integrado con MercadoPago
- [x] Servicio de Webhook multi-tenant
- [x] Módulo Email con Resend
- [x] WebSocket Gateway para updates en tiempo real
- [x] Controlador de webhooks `/api/webhooks/mercadopago`

### Variables de entorno necesarias

```env
MERCADOPAGO_ACCESS_TOKEN=xxx
RESEND_API_KEY=re_xxx
EMAIL_FROM=pedidos@tuapp.com
FRONTEND_URL=https://tu-frontend.com
BACKEND_URL=https://tu-backend.com
```

### Migración de BD

```bash
npx prisma migrate deploy
```
