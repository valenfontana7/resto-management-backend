# Delivery API Documentation

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Autenticación](#autenticación)
3. [Endpoints de Pedidos Delivery](#endpoints-de-pedidos-delivery)
4. [Endpoints de Repartidores](#endpoints-de-repartidores)
5. [Endpoints de Zonas](#endpoints-de-zonas)
6. [Tracking Público](#tracking-público)
7. [Modelos de Datos](#modelos-de-datos)
8. [Validaciones y Reglas de Negocio](#validaciones-y-reglas-de-negocio)
9. [Códigos de Error](#códigos-de-error)
10. [Ejemplos de Integración](#ejemplos-de-integración)

---

## Visión General

El módulo de **Delivery** permite gestionar el sistema completo de entregas a domicilio:

- **Zonas de Delivery**: Configurar áreas de cobertura con fees y mínimos personalizados
- **Repartidores**: Gestionar el equipo de delivery con tracking en tiempo real
- **Órdenes de Delivery**: Asignar, trackear y gestionar entregas
- **Tracking Público**: Permitir a clientes seguir sus pedidos en tiempo real

**Total de Endpoints**: 17 (16 privados + 1 público)

---

## Autenticación

Todos los endpoints (excepto el tracking público) requieren autenticación JWT:

```bash
Authorization: Bearer <token>
```

Además, se valida que el usuario tenga acceso al restaurante especificado.

---

## Endpoints de Pedidos Delivery

### 1. Listar Pedidos Delivery

**GET** `/api/restaurants/:restaurantId/delivery/orders`

Lista todos los pedidos con delivery del restaurante con filtros opcionales.

**Query Parameters:**

- `status` (opcional): `READY`, `ASSIGNED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`
- `driverId` (opcional): ID del repartidor
- `date` (opcional): Fecha en formato ISO (YYYY-MM-DD)
- `page` (default: 1)
- `limit` (default: 20, max: 100)

**Response:**

```json
{
  "orders": [
    {
      "id": "clxxx123",
      "orderNumber": "ORD-12345678",
      "orderId": "clyyy456",
      "customerId": "clyyy456",
      "customerName": "Juan Pérez",
      "customerPhone": "+54 9 11 1234-5678",
      "deliveryAddress": "Av. Corrientes 1234, CABA",
      "deliveryLat": -34.603722,
      "deliveryLng": -58.381592,
      "items": [
        {
          "dishId": "clzzz789",
          "dishName": "Pizza Muzzarella",
          "quantity": 2,
          "price": 450000,
          "notes": "Sin aceitunas"
        }
      ],
      "subtotal": 900000,
      "deliveryFee": 50000,
      "total": 950000,
      "status": "READY",
      "driverId": null,
      "driverName": null,
      "zoneId": "clwww111",
      "zoneName": "Centro",
      "estimatedDeliveryTime": 45,
      "distanceKm": 3.5,
      "paymentMethod": "cash",
      "isPaid": false,
      "readyAt": "2025-11-30T18:30:00Z",
      "assignedAt": null,
      "pickedUpAt": null,
      "deliveredAt": null,
      "customerNotes": "Tocar timbre 2 veces",
      "driverNotes": null,
      "createdAt": "2025-11-30T18:00:00Z",
      "updatedAt": "2025-11-30T18:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  },
  "stats": {
    "ready": 5,
    "assigned": 3,
    "inTransit": 7,
    "delivered": 30
  }
}
```

**Ejemplo cURL:**

```bash
curl -X GET \
  "http://localhost:4000/api/restaurants/clxxx/delivery/orders?status=READY&page=1&limit=20" \
  -H "Authorization: Bearer <token>"
```

---

### 2. Obtener Pedido Delivery por ID

**GET** `/api/restaurants/:restaurantId/delivery/orders/:orderId`

Obtiene los detalles completos de un pedido de delivery incluyendo timeline.

**Response:**

```json
{
  "order": {
    "id": "clxxx123",
    "orderNumber": "ORD-12345678",
    "orderId": "clyyy456",
    "customerId": "clyyy456",
    "customerName": "Juan Pérez",
    "customerPhone": "+54 9 11 1234-5678",
    "deliveryAddress": "Av. Corrientes 1234, CABA",
    "deliveryLat": -34.603722,
    "deliveryLng": -58.381592,
    "items": [...],
    "subtotal": 900000,
    "deliveryFee": 50000,
    "total": 950000,
    "status": "IN_TRANSIT",
    "driverId": "clddd222",
    "driverName": "Juan Repartidor",
    "zoneId": "clwww111",
    "zoneName": "Centro",
    "estimatedDeliveryTime": 45,
    "distanceKm": 3.5,
    "paymentMethod": "cash",
    "isPaid": false,
    "readyAt": "2025-11-30T18:30:00Z",
    "assignedAt": "2025-11-30T18:35:00Z",
    "pickedUpAt": "2025-11-30T18:40:00Z",
    "deliveredAt": null,
    "customerNotes": "Tocar timbre 2 veces",
    "driverNotes": "Edificio verde, depto 3A",
    "createdAt": "2025-11-30T18:00:00Z",
    "updatedAt": "2025-11-30T18:40:00Z",
    "timeline": [
      {
        "status": "ready",
        "timestamp": "2025-11-30T18:30:00Z",
        "note": "Pedido listo para envío"
      },
      {
        "status": "assigned",
        "timestamp": "2025-11-30T18:35:00Z",
        "note": "Asignado a Juan Repartidor",
        "driverId": "clddd222"
      },
      {
        "status": "picked-up",
        "timestamp": "2025-11-30T18:40:00Z",
        "note": "Juan Repartidor retiró el pedido"
      },
      {
        "status": "in-transit",
        "timestamp": "2025-11-30T18:41:00Z",
        "note": "Pedido en camino"
      }
    ]
  }
}
```

---

### 3. Asignar Repartidor a Pedido

**POST** `/api/restaurants/:restaurantId/delivery/orders/:orderId/assign`

Asigna un repartidor a un pedido que está en estado `READY`.

**Body:**

```json
{
  "driverId": "clddd222"
}
```

**Validaciones:**

- El pedido debe estar en estado `READY`
- El repartidor debe existir y pertenecer al restaurante
- El repartidor debe estar activo (`isActive = true`)
- El repartidor debe estar disponible (`isAvailable = true`)
- El repartidor no debe tener más de 3 pedidos activos simultáneamente

**Response:**

```json
{
  "success": true,
  "order": {
    "id": "clxxx123",
    "status": "ASSIGNED",
    "driverId": "clddd222",
    "assignedAt": "2025-11-30T18:35:00Z"
  },
  "message": "Pedido asignado a Juan Repartidor"
}
```

**Errores:**

- `404`: Pedido o repartidor no encontrado
- `400`: Pedido no está en estado READY
- `400`: Repartidor no está activo/disponible
- `400`: Repartidor ya tiene 3 pedidos asignados

---

### 4. Actualizar Estado del Delivery

**PATCH** `/api/restaurants/:restaurantId/delivery/orders/:orderId/status`

Actualiza el estado de un pedido de delivery.

**Body:**

```json
{
  "status": "PICKED_UP",
  "notes": "Pedido retirado a las 18:40",
  "lat": -34.603722,
  "lng": -58.381592
}
```

**Transiciones de Estado Válidas:**

```
READY → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
  ↓         ↓          ↓            ↓
CANCELLED CANCELLED CANCELLED  CANCELLED
```

**Response:**

```json
{
  "success": true,
  "order": {
    "id": "clxxx123",
    "status": "PICKED_UP",
    "pickedUpAt": "2025-11-30T18:40:00Z"
  },
  "updatedAt": "2025-11-30T18:40:00Z"
}
```

**Errores:**

- `400`: Transición de estado inválida (ej: READY → DELIVERED)

---

### 5. Estadísticas de Delivery

**GET** `/api/restaurants/:restaurantId/delivery/stats`

Obtiene estadísticas agregadas del sistema de delivery.

**Query Parameters:**

- `period`: `today`, `week`, `month`, `custom` (default: `today`)
- `startDate`: Requerido si `period=custom` (formato: YYYY-MM-DD)
- `endDate`: Requerido si `period=custom` (formato: YYYY-MM-DD)

**Response:**

```json
{
  "stats": {
    "totalOrders": 150,
    "pendingOrders": 5,
    "inTransitOrders": 7,
    "deliveredOrders": 138,
    "cancelledOrders": 5,
    "avgDeliveryTime": 38,
    "totalRevenue": 14250000,
    "totalDeliveryFees": 750000,
    "activeDrivers": 4,
    "topDriver": {
      "id": "clddd222",
      "name": "Juan Repartidor",
      "deliveries": 45,
      "avgTime": 35
    },
    "topZone": {
      "id": "clwww111",
      "name": "Centro",
      "orders": 67
    }
  }
}
```

---

## Endpoints de Repartidores

### 1. Listar Repartidores

**GET** `/api/restaurants/:restaurantId/delivery/drivers`

Lista todos los repartidores del restaurante con sus estadísticas.

**Query Parameters:**

- `isActive` (opcional): `true` | `false`
- `isAvailable` (opcional): `true` | `false`

**Response:**

```json
{
  "drivers": [
    {
      "id": "clddd222",
      "name": "Juan Repartidor",
      "phone": "+54 9 11 5555-5555",
      "email": "juan@delivery.com",
      "vehicle": "Moto",
      "licensePlate": "ABC123",
      "isActive": true,
      "isAvailable": true,
      "avatarUrl": "https://...",
      "stats": {
        "currentOrders": 2,
        "deliveriesToday": 12,
        "avgDeliveryTime": 35,
        "totalDeliveries": 456
      },
      "currentLocation": {
        "lat": -34.603722,
        "lng": -58.381592,
        "updatedAt": "2025-11-30T18:45:00Z"
      },
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

### 2. Crear Repartidor

**POST** `/api/restaurants/:restaurantId/delivery/drivers`

Crea un nuevo repartidor.

**Body:**

```json
{
  "name": "Juan Repartidor",
  "phone": "+54 9 11 5555-5555",
  "email": "juan@delivery.com",
  "vehicle": "Moto",
  "licensePlate": "ABC123",
  "avatarUrl": "https://..."
}
```

**Validaciones:**

- `name`: requerido, string
- `phone`: requerido, string
- `email`: formato email válido (opcional)
- `vehicle`: uno de "Moto", "Auto", "Bicicleta", "Otro" (opcional)

**Response:**

```json
{
  "success": true,
  "driver": {
    "id": "clddd333",
    "name": "Juan Repartidor",
    "phone": "+54 9 11 5555-5555",
    "isActive": true,
    "isAvailable": true
  },
  "message": "Repartidor creado exitosamente"
}
```

---

### 3. Actualizar Repartidor

**PUT** `/api/restaurants/:restaurantId/delivery/drivers/:driverId`

Actualiza los datos de un repartidor.

**Body:**

```json
{
  "name": "Juan Repartidor Actualizado",
  "phone": "+54 9 11 5555-6666",
  "isActive": true,
  "isAvailable": false
}
```

**Response:**

```json
{
  "success": true,
  "driver": {
    "id": "clddd222",
    "name": "Juan Repartidor Actualizado",
    "isAvailable": false
  }
}
```

---

### 4. Eliminar Repartidor

**DELETE** `/api/restaurants/:restaurantId/delivery/drivers/:driverId`

Elimina un repartidor.

**Validaciones:**

- No se puede eliminar si tiene pedidos activos (`ASSIGNED`, `PICKED_UP`, `IN_TRANSIT`)

**Response:**

```json
{
  "success": true,
  "message": "Repartidor eliminado"
}
```

**Errores:**

- `400`: El repartidor tiene pedidos activos

---

### 5. Estadísticas de Repartidor

**GET** `/api/restaurants/:restaurantId/delivery/drivers/:driverId/stats`

Obtiene estadísticas de un repartidor específico.

**Query Parameters:**

- `period`: `today`, `week`, `month` (default: `today`)

**Response:**

```json
{
  "driver": {
    "id": "clddd222",
    "name": "Juan Repartidor"
  },
  "stats": {
    "totalDeliveries": 145,
    "avgDeliveryTime": 35,
    "totalEarnings": 1450000,
    "deliveriesByDay": [
      { "date": "2025-11-24", "count": 18 },
      { "date": "2025-11-25", "count": 22 }
    ],
    "deliveriesByHour": {
      "12": 5,
      "13": 8,
      "19": 12,
      "20": 15
    }
  }
}
```

---

### 6. Actualizar Ubicación del Repartidor

**POST** `/api/restaurants/:restaurantId/delivery/drivers/:driverId/location`

Actualiza la ubicación en tiempo real del repartidor.

**Body:**

```json
{
  "lat": -34.603722,
  "lng": -58.381592,
  "heading": 180,
  "speed": 25.5
}
```

**Validaciones:**

- `lat`: número entre -90 y 90 (requerido)
- `lng`: número entre -180 y 180 (requerido)
- `heading`: número entre 0 y 360 (opcional)
- `speed`: número >= 0 (opcional)

**Response:**

```json
{
  "success": true,
  "timestamp": "2025-11-30T18:45:30Z"
}
```

**Uso típico:**
El repartidor (app móvil) envía su ubicación cada 5-10 segundos mientras está en tránsito.

---

### 7. Obtener Ubicación del Repartidor

**GET** `/api/restaurants/:restaurantId/delivery/drivers/:driverId/location`

Obtiene la última ubicación conocida del repartidor.

**Response:**

```json
{
  "location": {
    "lat": -34.603722,
    "lng": -58.381592,
    "heading": 180,
    "speed": 25.5,
    "timestamp": "2025-11-30T18:45:30Z"
  }
}
```

---

## Endpoints de Zonas

### 1. Listar Zonas

**GET** `/api/restaurants/:restaurantId/delivery/zones`

Lista todas las zonas de delivery configuradas.

**Response:**

```json
{
  "zones": [
    {
      "id": "clwww111",
      "name": "Centro",
      "deliveryFee": 50000,
      "minOrder": 300000,
      "estimatedTime": "30-45 min",
      "areas": ["Retiro", "San Nicolás", "Monserrat"],
      "isActive": true,
      "stats": {
        "ordersToday": 25,
        "avgDeliveryTime": 38
      },
      "createdAt": "2025-01-10T00:00:00Z"
    }
  ]
}
```

---

### 2. Crear Zona

**POST** `/api/restaurants/:restaurantId/delivery/zones`

Crea una nueva zona de delivery.

**Body:**

```json
{
  "name": "Centro",
  "deliveryFee": 50000,
  "minOrder": 300000,
  "estimatedTime": "30-45 min",
  "areas": ["Retiro", "San Nicolás", "Monserrat"]
}
```

**Validaciones:**

- `name`: requerido, único por restaurante
- `deliveryFee`: >= 0 (puede ser gratis)
- `minOrder`: >= 0
- `areas`: array no vacío

**Response:**

```json
{
  "success": true,
  "zone": {
    "id": "clwww222",
    "name": "Centro",
    "deliveryFee": 50000,
    "isActive": true
  },
  "message": "Zona creada exitosamente"
}
```

**Errores:**

- `409`: Ya existe una zona con ese nombre

---

### 3. Actualizar Zona

**PUT** `/api/restaurants/:restaurantId/delivery/zones/:zoneId`

Actualiza una zona de delivery.

**Body:**

```json
{
  "name": "Centro Ampliado",
  "deliveryFee": 60000,
  "minOrder": 350000,
  "areas": ["Retiro", "San Nicolás", "Monserrat", "Puerto Madero"],
  "isActive": true
}
```

**Response:**

```json
{
  "success": true,
  "zone": {
    "id": "clwww111",
    "name": "Centro Ampliado",
    "deliveryFee": 60000
  }
}
```

---

### 4. Eliminar Zona

**DELETE** `/api/restaurants/:restaurantId/delivery/zones/:zoneId`

Elimina una zona de delivery.

**Response:**

```json
{
  "success": true,
  "message": "Zona eliminada"
}
```

---

## Tracking Público

### Tracking de Pedido (Público)

**GET** `/api/tracking/:orderId?token=xxx`

Permite al cliente trackear su pedido en tiempo real **sin autenticación**.

**Query Parameters:**

- `token`: Token único del pedido (TODO: implementar generación)

**Response:**

```json
{
  "order": {
    "orderNumber": "ORD-12345678",
    "status": "IN_TRANSIT",
    "estimatedDeliveryTime": 45,
    "deliveryAddress": "Av. Corrientes 1234, CABA",
    "driver": {
      "name": "Juan",
      "phone": "+54 9 11 ****-5678",
      "vehicle": "Moto ABC123",
      "location": {
        "lat": -34.603722,
        "lng": -58.381592,
        "heading": 180,
        "updatedAt": "2025-11-30T18:45:30Z"
      }
    },
    "timeline": [
      {
        "status": "ready",
        "timestamp": "2025-11-30T18:30:00Z",
        "message": "Tu pedido está listo"
      },
      {
        "status": "assigned",
        "timestamp": "2025-11-30T18:35:00Z",
        "message": "Juan fue asignado a tu pedido"
      },
      {
        "status": "picked-up",
        "timestamp": "2025-11-30T18:40:00Z",
        "message": "Juan retiró tu pedido"
      },
      {
        "status": "in-transit",
        "timestamp": "2025-11-30T18:41:00Z",
        "message": "Tu pedido está en camino"
      }
    ]
  }
}
```

**Notas de Seguridad:**

- El teléfono del repartidor se enmascara (solo últimos 4 dígitos visibles)
- El endpoint es público pero requiere token de validación
- TODO: Implementar generación de tokens únicos por pedido

---

## Modelos de Datos

### DeliveryZone

```typescript
{
  id: string;
  restaurantId: string;
  name: string;
  deliveryFee: number; // centavos
  minOrder: number; // centavos
  estimatedTime: string; // "30-45 min"
  areas: string[]; // ["Barrio1", "Barrio2"]
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### DeliveryDriver

```typescript
{
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  email?: string;
  vehicle?: string; // "Moto", "Auto", "Bicicleta"
  licensePlate?: string;
  isActive: boolean;
  isAvailable: boolean;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### DeliveryOrder

```typescript
{
  id: string;
  orderId: string; // FK to Order
  driverId?: string; // FK to DeliveryDriver
  zoneId?: string; // FK to DeliveryZone

  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;

  status: DeliveryStatus;

  readyAt?: Date;
  assignedAt?: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;

  estimatedDeliveryTime?: number; // minutos
  distanceKm?: number;
  deliveryFee: number; // centavos

  driverNotes?: string;
  customerNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

### DeliveryStatus (Enum)

```typescript
enum DeliveryStatus {
  READY = 'READY', // Pedido listo para asignar
  ASSIGNED = 'ASSIGNED', // Asignado a repartidor
  PICKED_UP = 'PICKED_UP', // Repartidor retiró el pedido
  IN_TRANSIT = 'IN_TRANSIT', // En camino
  DELIVERED = 'DELIVERED', // Entregado
  CANCELLED = 'CANCELLED', // Cancelado
}
```

---

## Validaciones y Reglas de Negocio

### Asignación de Pedidos

1. **Repartidor disponible**: `isActive = true AND isAvailable = true`
2. **Límite de pedidos**: Máximo 3 pedidos activos por repartidor
3. **Estado del pedido**: Solo pedidos en estado `READY` pueden ser asignados

### Transiciones de Estado

```
READY → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
  ↓         ↓          ↓            ↓
CANCELLED CANCELLED CANCELLED  CANCELLED
```

**No permitido:**

- READY → PICKED_UP (debe pasar por ASSIGNED)
- DELIVERED → cualquier otro estado
- CANCELLED → cualquier otro estado

### Cálculo de Delivery Fee

1. Si el pedido pertenece a una zona: usar `deliveryZone.deliveryFee`
2. Si no hay zona: usar fee por defecto del restaurante
3. Puede modificarse manualmente al crear el pedido

### Eliminación de Repartidores

- No se puede eliminar si tiene pedidos en estados: `ASSIGNED`, `PICKED_UP`, `IN_TRANSIT`
- Si tiene solo pedidos `DELIVERED` o `CANCELLED`, se puede eliminar

---

## Códigos de Error

| Código | Mensaje                                                | Descripción                                      |
| ------ | ------------------------------------------------------ | ------------------------------------------------ |
| 400    | El pedido debe estar en estado READY                   | Intentando asignar repartidor a pedido no listo  |
| 400    | El repartidor no está activo                           | Repartidor desactivado                           |
| 400    | El repartidor no está disponible                       | Repartidor ocupado                               |
| 400    | El repartidor ya tiene el máximo de pedidos            | Límite de 3 pedidos alcanzado                    |
| 400    | Transición de estado inválida                          | Estado actual no permite cambiar al nuevo estado |
| 400    | No se puede eliminar un repartidor con pedidos activos | Intentando eliminar repartidor asignado          |
| 404    | Pedido de delivery no encontrado                       | ID de pedido inválido                            |
| 404    | Repartidor no encontrado                               | ID de repartidor inválido                        |
| 404    | Zona no encontrada                                     | ID de zona inválido                              |
| 404    | No hay ubicación disponible                            | Repartidor nunca reportó ubicación               |
| 409    | Ya existe una zona con ese nombre                      | Nombre duplicado                                 |

---

## Ejemplos de Integración

### React/TypeScript: Servicio de Delivery

```typescript
// services/deliveryService.ts
import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

class DeliveryService {
  private getHeaders() {
    const token = localStorage.getItem('token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // ORDERS
  async getOrders(
    restaurantId: string,
    filters: {
      status?: string;
      driverId?: string;
      date?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });

    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/delivery/orders?${params}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async getOrderById(restaurantId: string, orderId: string) {
    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/delivery/orders/${orderId}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async assignDriver(restaurantId: string, orderId: string, driverId: string) {
    const response = await axios.post(
      `${API_URL}/restaurants/${restaurantId}/delivery/orders/${orderId}/assign`,
      { driverId },
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    status: string,
    notes?: string,
    location?: { lat: number; lng: number },
  ) {
    const response = await axios.patch(
      `${API_URL}/restaurants/${restaurantId}/delivery/orders/${orderId}/status`,
      { status, notes, ...location },
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async getStats(restaurantId: string, period = 'today') {
    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/delivery/stats?period=${period}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  // DRIVERS
  async getDrivers(
    restaurantId: string,
    filters: {
      isActive?: boolean;
      isAvailable?: boolean;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });

    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/delivery/drivers?${params}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async createDriver(
    restaurantId: string,
    data: {
      name: string;
      phone: string;
      email?: string;
      vehicle?: string;
      licensePlate?: string;
    },
  ) {
    const response = await axios.post(
      `${API_URL}/restaurants/${restaurantId}/delivery/drivers`,
      data,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async updateDriver(restaurantId: string, driverId: string, data: any) {
    const response = await axios.put(
      `${API_URL}/restaurants/${restaurantId}/delivery/drivers/${driverId}`,
      data,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async deleteDriver(restaurantId: string, driverId: string) {
    const response = await axios.delete(
      `${API_URL}/restaurants/${restaurantId}/delivery/drivers/${driverId}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async updateDriverLocation(
    restaurantId: string,
    driverId: string,
    location: { lat: number; lng: number; heading?: number; speed?: number },
  ) {
    const response = await axios.post(
      `${API_URL}/restaurants/${restaurantId}/delivery/drivers/${driverId}/location`,
      location,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async getDriverLocation(restaurantId: string, driverId: string) {
    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/delivery/drivers/${driverId}/location`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  // ZONES
  async getZones(restaurantId: string) {
    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/delivery/zones`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async createZone(
    restaurantId: string,
    data: {
      name: string;
      deliveryFee: number;
      minOrder: number;
      estimatedTime?: string;
      areas: string[];
    },
  ) {
    const response = await axios.post(
      `${API_URL}/restaurants/${restaurantId}/delivery/zones`,
      data,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async updateZone(restaurantId: string, zoneId: string, data: any) {
    const response = await axios.put(
      `${API_URL}/restaurants/${restaurantId}/delivery/zones/${zoneId}`,
      data,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async deleteZone(restaurantId: string, zoneId: string) {
    const response = await axios.delete(
      `${API_URL}/restaurants/${restaurantId}/delivery/zones/${zoneId}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  // PUBLIC TRACKING
  async getPublicTracking(orderId: string, token: string) {
    const response = await axios.get(
      `${API_URL}/tracking/${orderId}?token=${token}`,
    );
    return response.data;
  }
}

export default new DeliveryService();
```

### React: Hook para Polling de Ubicación

```typescript
// hooks/useDriverTracking.ts
import { useEffect, useState } from 'react';
import deliveryService from '../services/deliveryService';

export const useDriverTracking = (
  restaurantId: string,
  driverId: string,
  enabled: boolean = true,
) => {
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const fetchLocation = async () => {
      try {
        const data = await deliveryService.getDriverLocation(
          restaurantId,
          driverId,
        );
        setLocation(data.location);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Error al obtener ubicación');
      }
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 5000); // Cada 5 segundos

    return () => clearInterval(interval);
  }, [restaurantId, driverId, enabled]);

  return { location, error };
};
```

### cURL: Testing Completo

```bash
# 1. Crear zona de delivery
curl -X POST http://localhost:4000/api/restaurants/clxxx/delivery/zones \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Centro",
    "deliveryFee": 50000,
    "minOrder": 300000,
    "estimatedTime": "30-45 min",
    "areas": ["Retiro", "San Nicolás"]
  }'

# 2. Crear repartidor
curl -X POST http://localhost:4000/api/restaurants/clxxx/delivery/drivers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Repartidor",
    "phone": "+54 9 11 5555-5555",
    "email": "juan@delivery.com",
    "vehicle": "Moto",
    "licensePlate": "ABC123"
  }'

# 3. Listar pedidos READY
curl -X GET "http://localhost:4000/api/restaurants/clxxx/delivery/orders?status=READY" \
  -H "Authorization: Bearer <token>"

# 4. Asignar repartidor a pedido
curl -X POST http://localhost:4000/api/restaurants/clxxx/delivery/orders/clyyy/assign \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "driverId": "clddd" }'

# 5. Actualizar estado a PICKED_UP
curl -X PATCH http://localhost:4000/api/restaurants/clxxx/delivery/orders/clyyy/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PICKED_UP",
    "notes": "Pedido retirado",
    "lat": -34.603722,
    "lng": -58.381592
  }'

# 6. Actualizar ubicación del repartidor
curl -X POST http://localhost:4000/api/restaurants/clxxx/delivery/drivers/clddd/location \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": -34.604000,
    "lng": -58.382000,
    "heading": 180,
    "speed": 25.5
  }'

# 7. Obtener estadísticas del día
curl -X GET "http://localhost:4000/api/restaurants/clxxx/delivery/stats?period=today" \
  -H "Authorization: Bearer <token>"

# 8. Tracking público (sin auth)
curl -X GET "http://localhost:4000/api/tracking/clyyy?token=abc123"
```

---

## Testing Checklist

### Zonas de Delivery

- [ ] Crear zona con todos los campos
- [ ] Crear zona con nombre duplicado (debe fallar)
- [ ] Listar zonas
- [ ] Actualizar zona
- [ ] Eliminar zona
- [ ] Verificar estadísticas de zona (ordersToday, avgDeliveryTime)

### Repartidores

- [ ] Crear repartidor con campos mínimos
- [ ] Crear repartidor con todos los campos
- [ ] Listar repartidores
- [ ] Filtrar repartidores por isActive
- [ ] Filtrar repartidores por isAvailable
- [ ] Actualizar repartidor
- [ ] Cambiar isAvailable a false
- [ ] Intentar eliminar repartidor con pedidos activos (debe fallar)
- [ ] Eliminar repartidor sin pedidos activos
- [ ] Obtener estadísticas de repartidor
- [ ] Actualizar ubicación del repartidor
- [ ] Obtener ubicación del repartidor

### Pedidos de Delivery

- [ ] Listar pedidos sin filtros
- [ ] Filtrar por status=READY
- [ ] Filtrar por driverId
- [ ] Filtrar por fecha
- [ ] Paginación (page=2, limit=10)
- [ ] Obtener pedido por ID
- [ ] Asignar repartidor a pedido READY
- [ ] Intentar asignar repartidor inactivo (debe fallar)
- [ ] Intentar asignar repartidor con 3 pedidos (debe fallar)
- [ ] Actualizar estado: READY → ASSIGNED
- [ ] Actualizar estado: ASSIGNED → PICKED_UP
- [ ] Actualizar estado: PICKED_UP → IN_TRANSIT
- [ ] Actualizar estado: IN_TRANSIT → DELIVERED
- [ ] Intentar transición inválida (debe fallar)
- [ ] Cancelar pedido en estado READY
- [ ] Obtener estadísticas del día
- [ ] Obtener estadísticas de la semana
- [ ] Verificar topDriver en stats
- [ ] Verificar topZone en stats

### Tracking Público

- [ ] Obtener tracking con token válido
- [ ] Verificar que teléfono esté enmascarado
- [ ] Verificar timeline completo
- [ ] Verificar ubicación del repartidor en respuesta

---

## Próximos Pasos / TODOs

1. **Autenticación de Tracking Público**
   - Implementar generación de tokens únicos por pedido
   - Validar token en endpoint `/api/tracking/:orderId`

2. **Notificaciones**
   - WebSockets para actualización en tiempo real
   - Push notifications para repartidores
   - SMS/Email para clientes

3. **Optimización de Rutas**
   - Algoritmo para asignar múltiples pedidos a un repartidor
   - Calcular ruta óptima con API externa (Google Maps, Mapbox)

4. **Geocodificación**
   - Integrar API de geocodificación para convertir direcciones a coordenadas
   - Calcular distancia real usando routing API

5. **Gestión de Zonas Avanzada**
   - Asignar zonas específicas a repartidores
   - Geofencing (polígonos en mapa)

6. **Métricas Avanzadas**
   - Tiempo real vs estimado por delivery
   - Tasa de cancelación por repartidor
   - Heat map de zonas más activas

---

**Última actualización**: 30 de noviembre de 2025
**Versión**: 1.0.0
