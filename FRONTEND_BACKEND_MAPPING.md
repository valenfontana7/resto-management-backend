# 🔗 Mapeo de Endpoints Frontend ↔ Backend

## ✅ Estado de Implementación

### Authentication

| Frontend Endpoint         | Backend Endpoint          | Status   | Notas                          |
| ------------------------- | ------------------------- | -------- | ------------------------------ |
| POST `/api/auth/register` | POST `/api/auth/register` | ✅ Listo | Incluye creación de restaurant |
| POST `/api/auth/login`    | POST `/api/auth/login`    | ✅ Listo | Retorna JWT token              |
| GET `/api/auth/me`        | GET `/api/auth/me`        | ✅ Listo | Info del usuario autenticado   |

### Restaurants

| Frontend Endpoint                 | Backend Endpoint                  | Status   | Notas               |
| --------------------------------- | --------------------------------- | -------- | ------------------- |
| GET `/api/restaurants/slug/:slug` | GET `/api/restaurants/slug/:slug` | ✅ Listo | Público - para menú |
| GET `/api/restaurants/me`         | GET `/api/restaurants/me`         | ✅ Listo | Mi restaurante      |
| POST `/api/restaurants`           | POST `/api/restaurants`           | ✅ Listo | Crear restaurante   |
| PATCH `/api/restaurants/:id`      | PATCH `/api/restaurants/:id`      | ✅ Listo | Actualizar config   |

### Menu - Categories

| Frontend Endpoint                                        | Backend Endpoint                                         | Status   | Notas                   |
| -------------------------------------------------------- | -------------------------------------------------------- | -------- | ----------------------- |
| GET `/api/menu/:restaurantId/categories`                 | GET `/api/menu/:restaurantId/categories`                 | ✅ Listo | Público - menú completo |
| GET `/api/categories/restaurant/:restaurantId`           | GET `/api/categories/restaurant/:restaurantId`           | ✅ Listo | Admin - listar          |
| POST `/api/categories/restaurant/:restaurantId`          | POST `/api/categories/restaurant/:restaurantId`          | ✅ Listo | Crear categoría         |
| PATCH `/api/categories/:id/restaurant/:restaurantId`     | PATCH `/api/categories/:id/restaurant/:restaurantId`     | ✅ Listo | Actualizar              |
| DELETE `/api/categories/:id/restaurant/:restaurantId`    | DELETE `/api/categories/:id/restaurant/:restaurantId`    | ✅ Listo | Soft delete             |
| PATCH `/api/categories/reorder/restaurant/:restaurantId` | PATCH `/api/categories/reorder/restaurant/:restaurantId` | ✅ Listo | Reordenar               |

### Menu - Dishes

| Frontend Endpoint                                             | Backend Endpoint                                              | Status   | Notas                 |
| ------------------------------------------------------------- | ------------------------------------------------------------- | -------- | --------------------- |
| GET `/api/dishes/restaurant/:restaurantId`                    | GET `/api/dishes/restaurant/:restaurantId`                    | ✅ Listo | Con filtros           |
| POST `/api/dishes/restaurant/:restaurantId`                   | POST `/api/dishes/restaurant/:restaurantId`                   | ✅ Listo | Crear plato           |
| PATCH `/api/dishes/:id/restaurant/:restaurantId`              | PATCH `/api/dishes/:id/restaurant/:restaurantId`              | ✅ Listo | Actualizar            |
| DELETE `/api/dishes/:id/restaurant/:restaurantId`             | DELETE `/api/dishes/:id/restaurant/:restaurantId`             | ✅ Listo | Soft delete           |
| PATCH `/api/dishes/:id/restaurant/:restaurantId/availability` | PATCH `/api/dishes/:id/restaurant/:restaurantId/availability` | ✅ Listo | Toggle disponibilidad |

### Orders (Dashboard Critical)

| Frontend Endpoint                                        | Backend Endpoint                                         | Status   | Notas                      |
| -------------------------------------------------------- | -------------------------------------------------------- | -------- | -------------------------- |
| POST `/api/restaurants/:restaurantId/orders`             | POST `/api/restaurants/:restaurantId/orders`             | ✅ Listo | Público - crear orden      |
| GET `/api/restaurants/:restaurantId/orders`              | GET `/api/restaurants/:restaurantId/orders`              | ✅ Listo | Admin - listar con filtros |
| GET `/api/restaurants/:restaurantId/orders/:id`          | GET `/api/restaurants/:restaurantId/orders/:id`          | ✅ Listo | Detalle de orden           |
| PATCH `/api/restaurants/:restaurantId/orders/:id/status` | PATCH `/api/restaurants/:restaurantId/orders/:id/status` | ✅ Listo | Cambiar estado             |

### Dashboard Stats

| Frontend Endpoint                                     | Backend Endpoint                                      | Status   | Notas                         |
| ----------------------------------------------------- | ----------------------------------------------------- | -------- | ----------------------------- |
| GET `/api/restaurants/:restaurantId/stats/today`      | GET `/api/restaurants/:restaurantId/stats/today`      | ✅ Listo | Stats con comparación vs ayer |
| GET `/api/restaurants/:restaurantId/stats/top-dishes` | GET `/api/restaurants/:restaurantId/stats/top-dishes` | ✅ Listo | Top 10 platos más vendidos    |

### Tables

| Frontend Endpoint                                               | Backend Endpoint                                                | Status   | Notas                          |
| --------------------------------------------------------------- | --------------------------------------------------------------- | -------- | ------------------------------ |
| GET `/api/tables/restaurant/:restaurantId`                      | GET `/api/tables/restaurant/:restaurantId`                      | ✅ Listo | Listar mesas por áreas         |
| GET `/api/tables/restaurant/:restaurantId/stats`                | GET `/api/tables/restaurant/:restaurantId/stats`                | ✅ Listo | Estadísticas de ocupación      |
| GET `/api/tables/:id/restaurant/:restaurantId`                  | GET `/api/tables/:id/restaurant/:restaurantId`                  | ✅ Listo | Detalle de mesa                |
| POST `/api/tables/restaurant/:restaurantId`                     | POST `/api/tables/restaurant/:restaurantId`                     | ✅ Listo | Crear mesa con área y posición |
| PATCH `/api/tables/:id/restaurant/:restaurantId`                | PATCH `/api/tables/:id/restaurant/:restaurantId`                | ✅ Listo | Actualizar mesa                |
| PATCH `/api/tables/:id/restaurant/:restaurantId/status/:status` | PATCH `/api/tables/:id/restaurant/:restaurantId/status/:status` | ✅ Listo | Cambiar estado con validación  |
| DELETE `/api/tables/:id/restaurant/:restaurantId`               | DELETE `/api/tables/:id/restaurant/:restaurantId`               | ✅ Listo | Eliminar mesa                  |

### Table Areas

| Frontend Endpoint                                       | Backend Endpoint                                        | Status   | Notas           |
| ------------------------------------------------------- | ------------------------------------------------------- | -------- | --------------- |
| GET `/api/tables/restaurant/:restaurantId/areas`        | GET `/api/tables/restaurant/:restaurantId/areas`        | ✅ Listo | Listar áreas    |
| POST `/api/tables/restaurant/:restaurantId/areas`       | POST `/api/tables/restaurant/:restaurantId/areas`       | ✅ Listo | Crear área      |
| PATCH `/api/tables/areas/:id/restaurant/:restaurantId`  | PATCH `/api/tables/areas/:id/restaurant/:restaurantId`  | ✅ Listo | Actualizar área |
| DELETE `/api/tables/areas/:id/restaurant/:restaurantId` | DELETE `/api/tables/areas/:id/restaurant/:restaurantId` | ✅ Listo | Eliminar área   |

### Payments (MercadoPago)

| Frontend Endpoint                               | Backend Endpoint                                | Status   | Notas                |
| ----------------------------------------------- | ----------------------------------------------- | -------- | -------------------- |
| POST `/api/payments/create-preference/:orderId` | POST `/api/payments/create-preference/:orderId` | ✅ Listo | Crear preferencia MP |
| POST `/api/payments/webhook`                    | POST `/api/payments/webhook`                    | ✅ Listo | Webhook MP (público) |
| GET `/api/payments/status/:orderId`             | GET `/api/payments/status/:orderId`             | ✅ Listo | Estado de pago       |

### Reservations

| Frontend Endpoint                                                      | Backend Endpoint                                                       | Status   | Notas              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- | ------------------ |
| GET `/api/restaurants/:restaurantId/reservations`                      | GET `/api/restaurants/:restaurantId/reservations`                      | ✅ Listo | Listar con filtros |
| GET `/api/restaurants/:restaurantId/reservations/:id`                  | GET `/api/restaurants/:restaurantId/reservations/:id`                  | ✅ Listo | Detalle de reserva |
| POST `/api/restaurants/:restaurantId/reservations`                     | POST `/api/restaurants/:restaurantId/reservations`                     | ✅ Listo | Crear reserva      |
| PATCH `/api/restaurants/:restaurantId/reservations/:id`                | PATCH `/api/restaurants/:restaurantId/reservations/:id`                | ✅ Listo | Actualizar reserva |
| PATCH `/api/restaurants/:restaurantId/reservations/:id/status/:status` | PATCH `/api/restaurants/:restaurantId/reservations/:id/status/:status` | ✅ Listo | Cambiar estado     |
| DELETE `/api/restaurants/:restaurantId/reservations/:id`               | DELETE `/api/restaurants/:restaurantId/reservations/:id`               | ✅ Listo | Eliminar reserva   |

### Analytics & Reporting

| Frontend Endpoint                                               | Backend Endpoint                                                | Status   | Notas                        |
| --------------------------------------------------------------- | --------------------------------------------------------------- | -------- | ---------------------------- |
| GET `/api/analytics/restaurant/:restaurantId/sales`             | GET `/api/analytics/restaurant/:restaurantId/sales`             | ✅ Listo | Evolución de ventas          |
| GET `/api/analytics/restaurant/:restaurantId/categories`        | GET `/api/analytics/restaurant/:restaurantId/categories`        | ✅ Listo | Distribución por categorías  |
| GET `/api/analytics/restaurant/:restaurantId/hourly`            | GET `/api/analytics/restaurant/:restaurantId/hourly`            | ✅ Listo | Análisis por hora del día    |
| GET `/api/analytics/restaurant/:restaurantId/top-customers`     | GET `/api/analytics/restaurant/:restaurantId/top-customers`     | ✅ Listo | Mejores clientes             |
| GET `/api/analytics/restaurant/:restaurantId/performance`       | GET `/api/analytics/restaurant/:restaurantId/performance`       | ✅ Listo | Métricas de rendimiento      |
| GET `/api/analytics/restaurant/:restaurantId/comparison`        | GET `/api/analytics/restaurant/:restaurantId/comparison`        | ✅ Listo | Comparación vs período prev. |
| GET `/api/analytics/restaurant/:restaurantId/top-dishes`        | GET `/api/analytics/restaurant/:restaurantId/top-dishes`        | ✅ Listo | Platos más vendidos          |
| GET `/api/analytics/restaurant/:restaurantId/revenue-breakdown` | GET `/api/analytics/restaurant/:restaurantId/revenue-breakdown` | ✅ Listo | Ingresos por tipo orden      |

---

## 📊 Detalles de Respuestas

### GET `/api/restaurants/:restaurantId/stats/today`

**Response:**

```json
{
  "today": {
    "revenue": 458900,
    "orders": 42,
    "averageOrder": 10926,
    "reservations": 8
  },
  "yesterday": {
    "revenue": 389500,
    "orders": 38,
    "averageOrder": 10250,
    "reservations": 6
  },
  "percentageChange": {
    "revenue": 17.8,
    "orders": 10.5,
    "averageOrder": 6.6,
    "reservations": 33.3
  }
}
```

### GET `/api/restaurants/:restaurantId/stats/top-dishes?period=today`

**Query Params:**

- `period`: `today` | `week` | `month` (default: `today`)

**Response:**

```json
{
  "topDishes": [
    {
      "dishId": "clx...",
      "dishName": "Milanesa Napolitana",
      "categoryName": "Platos Principales",
      "quantity": 42,
      "revenue": 243600,
      "percentage": 28.5
    }
  ]
}
```

### GET `/api/restaurants/:restaurantId/orders?status=pending&date=2025-11-26`

**Query Params:**

- `status`: `pending` | `confirmed` | `preparing` | `ready` | `delivered` | `cancelled`
- `type`: `DINE_IN` | `PICKUP` | `DELIVERY`
- `startDate`: ISO date string
- `endDate`: ISO date string
- `customerPhone`: string

**Response:**

```json
{
  "orders": [
    {
      "id": "clx...",
      "customerName": "María González",
      "customerEmail": "maria@email.com",
      "customerPhone": "+5491123456789",
      "type": "DELIVERY",
      "status": "PREPARING",
      "paymentStatus": "PAID",
      "subtotal": 11600,
      "deliveryFee": 1200,
      "tip": 200,
      "total": 13000,
      "deliveryAddress": "Av. Libertador 5678",
      "notes": "Sin cebolla",
      "items": [
        {
          "id": "item_1",
          "dishId": "dish_abc",
          "quantity": 2,
          "unitPrice": 5800,
          "subtotal": 11600,
          "notes": "Extra queso",
          "dish": {
            "id": "dish_abc",
            "name": "Milanesa Napolitana",
            "image": "..."
          }
        }
      ],
      "statusHistory": [
        {
          "id": "hist_1",
          "fromStatus": "CONFIRMED",
          "toStatus": "PREPARING",
          "changedBy": "user_id",
          "notes": "En cocina",
          "createdAt": "2025-11-26T18:45:00Z"
        }
      ],
      "createdAt": "2025-11-26T18:30:00Z",
      "updatedAt": "2025-11-26T18:45:00Z"
    }
  ],
  "count": 15
}
```

### PATCH `/api/restaurants/:restaurantId/orders/:id/status`

**Request:**

```json
{
  "status": "PREPARING",
  "notes": "En cocina, tiempo estimado 20 min"
}
```

**Response:**

```json
{
  "order": {
    "id": "clx...",
    "status": "PREPARING",
    "updatedAt": "2025-11-26T18:45:00Z",
    "items": [...],
    "statusHistory": [...]
  }
}
```

---

## 🎯 Validaciones de Estado de Órdenes

### Transiciones Válidas

```
PENDING → CONFIRMED, CANCELLED
CONFIRMED → PREPARING, CANCELLED
PREPARING → READY, CANCELLED
READY → DELIVERED, CANCELLED
DELIVERED → (estado final)
CANCELLED → (estado final)
```

El backend valida estas transiciones automáticamente y retorna error 400 si se intenta una transición inválida.

---

## 🔐 Autenticación

Todos los endpoints marcados como "Admin" requieren:

```
Authorization: Bearer {jwt_token}
```

Los endpoints "Públicos" no requieren autenticación:

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/restaurants/slug/:slug`
- GET `/api/menu/:restaurantId/categories`
- POST `/api/restaurants/:restaurantId/orders`
- POST `/api/payments/webhook`

---

## 🚀 Testing Rápido

### 1. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@restaurant.com","password":"password"}'
```

### 2. Get Today Stats

```bash
TOKEN="your_token_here"
RESTAURANT_ID="your_restaurant_id"

curl http://localhost:3000/api/restaurants/$RESTAURANT_ID/stats/today \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Get Top Dishes

```bash
curl "http://localhost:3000/api/restaurants/$RESTAURANT_ID/stats/top-dishes?period=today" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. List Orders

```bash
curl "http://localhost:3000/api/restaurants/$RESTAURANT_ID/orders?status=PENDING" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Update Order Status

```bash
ORDER_ID="order_id_here"

curl -X PATCH http://localhost:3000/api/restaurants/$RESTAURANT_ID/orders/$ORDER_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"PREPARING","notes":"En cocina"}'
```

---

## ✅ Status Final

**Total de Endpoints Implementados:** 65+

**Endpoints Críticos para Dashboard:**

- ✅ Stats Today (con comparación vs ayer)
- ✅ Top Dishes (con período configurable)
- ✅ List Orders (con filtros múltiples)
- ✅ Update Order Status (con validación de transiciones)
- ✅ Get Order Details
- ✅ Reservations CRUD completo (con filtros por fecha y estado)
- ✅ Tables con áreas, posiciones y estados (integrado con Orders/Reservations)
- ✅ Analytics completo (8 endpoints: ventas, categorías, horarios, clientes, performance, comparación, top dishes, revenue breakdown)

**Backend Status:** 🟢 100% READY para conectar con Frontend

**Documentación Completa:**

- `TABLES_MANAGEMENT_API.md` - Gestión de mesas y áreas (15 endpoints)
- `RESERVATIONS_API.md` - Sistema de reservas (6 endpoints)
- `ANALYTICS_API.md` - Analíticas y reportes (8 endpoints)
- `API_EXAMPLES.md` - Ejemplos de todos los flujos
- `TESTING_CHECKLIST.md` - 25+ validaciones

**Próximos pasos opcionales:**

- WebSocket/SSE para notificaciones en tiempo real
- Upload de imágenes con Cloudinary
- Exportación de reportes a PDF/CSV
