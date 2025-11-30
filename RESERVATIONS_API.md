# 📅 Reservations API Documentation

## Endpoints Disponibles

### 1. Listar Reservas

```bash
GET /api/restaurants/:restaurantId/reservations
```

**Query Parameters:**

- `date`: Fecha en formato ISO (YYYY-MM-DD) para filtrar por día específico
- `status`: Estado de la reserva (PENDING, CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW)

**Ejemplo:**

```bash
curl -X GET "http://localhost:3000/api/restaurants/cmi9qu9e400006cdkxffpnsh7/reservations?date=2025-11-27" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "reservations": [
    {
      "id": "res_123",
      "restaurantId": "cmi9qu9e400006cdkxffpnsh7",
      "customerName": "Juan Pérez",
      "customerEmail": "juan@email.com",
      "customerPhone": "+5491123456789",
      "date": "2025-11-27T00:00:00.000Z",
      "time": "20:00",
      "partySize": 4,
      "status": "CONFIRMED",
      "tableId": "table_123",
      "notes": "Celebración de cumpleaños",
      "createdAt": "2025-11-26T10:00:00.000Z",
      "updatedAt": "2025-11-26T10:30:00.000Z",
      "table": {
        "id": "table_123",
        "number": 5,
        "capacity": 4,
        "status": "RESERVED"
      }
    }
  ],
  "count": 1
}
```

---

### 2. Crear Nueva Reserva

```bash
POST /api/restaurants/:restaurantId/reservations
```

**Request Body:**

```json
{
  "customerName": "María González",
  "customerEmail": "maria@email.com",
  "customerPhone": "+5491187654321",
  "date": "2025-11-28",
  "time": "21:00",
  "partySize": 2,
  "tableId": "table_456",
  "notes": "Mesa cerca de la ventana por favor"
}
```

**Campos Opcionales:**

- `customerEmail`
- `tableId` (se puede asignar después)
- `notes`

**Ejemplo:**

```bash
curl -X POST "http://localhost:3000/api/restaurants/cmi9qu9e400006cdkxffpnsh7/reservations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "María González",
    "customerPhone": "+5491187654321",
    "date": "2025-11-28",
    "time": "21:00",
    "partySize": 2
  }'
```

**Response:**

```json
{
  "id": "res_456",
  "restaurantId": "cmi9qu9e400006cdkxffpnsh7",
  "customerName": "María González",
  "customerEmail": null,
  "customerPhone": "+5491187654321",
  "date": "2025-11-28T00:00:00.000Z",
  "time": "21:00",
  "partySize": 2,
  "status": "PENDING",
  "tableId": null,
  "notes": null,
  "createdAt": "2025-11-27T14:30:00.000Z",
  "updatedAt": "2025-11-27T14:30:00.000Z",
  "table": null
}
```

---

### 3. Obtener Detalle de Reserva

```bash
GET /api/restaurants/:restaurantId/reservations/:id
```

**Ejemplo:**

```bash
curl -X GET "http://localhost:3000/api/restaurants/cmi9qu9e400006cdkxffpnsh7/reservations/res_456" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:** Mismo formato que al crear, pero con los datos actualizados.

---

### 4. Actualizar Reserva

```bash
PATCH /api/restaurants/:restaurantId/reservations/:id
```

**Request Body (todos los campos son opcionales):**

```json
{
  "customerName": "María González de Pérez",
  "customerEmail": "maria.perez@email.com",
  "customerPhone": "+5491187654321",
  "date": "2025-11-28",
  "time": "20:30",
  "partySize": 3,
  "tableId": "table_789",
  "status": "CONFIRMED",
  "notes": "Actualizado: traen silla para bebé"
}
```

**Ejemplo:**

```bash
curl -X PATCH "http://localhost:3000/api/restaurants/cmi9qu9e400006cdkxffpnsh7/reservations/res_456" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CONFIRMED",
    "tableId": "table_789"
  }'
```

**Response:** Reserva actualizada con todos los campos.

---

### 5. Cambiar Estado de Reserva

```bash
PATCH /api/restaurants/:restaurantId/reservations/:id/status/:status
```

**Estados Válidos:**

- `PENDING` - Pendiente de confirmación
- `CONFIRMED` - Confirmada
- `SEATED` - Cliente sentado en mesa
- `COMPLETED` - Finalizada exitosamente
- `CANCELLED` - Cancelada
- `NO_SHOW` - Cliente no se presentó

**Ejemplo - Confirmar Reserva:**

```bash
curl -X PATCH "http://localhost:3000/api/restaurants/cmi9qu9e400006cdkxffpnsh7/reservations/res_456/status/CONFIRMED" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Ejemplo - Marcar Cliente Sentado:**

```bash
curl -X PATCH "http://localhost:3000/api/restaurants/cmi9qu9e400006cdkxffpnsh7/reservations/res_456/status/SEATED" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:** Reserva actualizada con el nuevo estado.

---

### 6. Eliminar Reserva

```bash
DELETE /api/restaurants/:restaurantId/reservations/:id
```

**Ejemplo:**

```bash
curl -X DELETE "http://localhost:3000/api/restaurants/cmi9qu9e400006cdkxffpnsh7/reservations/res_456" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "message": "Reservation deleted successfully"
}
```

---

## 🔄 Flujo Típico de Reserva

### 1. Cliente Hace Reserva (PENDING)

```bash
POST /api/restaurants/:restaurantId/reservations
{
  "customerName": "Carlos Rodríguez",
  "customerPhone": "+5491134567890",
  "date": "2025-11-30",
  "time": "19:30",
  "partySize": 6
}
```

### 2. Restaurante Confirma y Asigna Mesa (CONFIRMED)

```bash
PATCH /api/restaurants/:restaurantId/reservations/:id
{
  "status": "CONFIRMED",
  "tableId": "table_10",
  "notes": "Mesa grande confirmada"
}
```

### 3. Cliente Llega y es Sentado (SEATED)

```bash
PATCH /api/restaurants/:restaurantId/reservations/:id/status/SEATED
```

### 4. Cliente Termina su Comida (COMPLETED)

```bash
PATCH /api/restaurants/:restaurantId/reservations/:id/status/COMPLETED
```

---

## 📊 Casos de Uso Frontend

### Dashboard - Vista Diaria de Reservas

```bash
# Obtener todas las reservas de hoy
GET /api/restaurants/:restaurantId/reservations?date=2025-11-27

# Filtrar solo confirmadas
GET /api/restaurants/:restaurantId/reservations?date=2025-11-27&status=CONFIRMED
```

### Widget - Reservas Pendientes

```bash
# Obtener solo las pendientes de confirmación
GET /api/restaurants/:restaurantId/reservations?status=PENDING
```

### Calendario de Reservas

```bash
# Obtener reservas de un día específico
GET /api/restaurants/:restaurantId/reservations?date=2025-12-01
```

---

## ⚠️ Validaciones y Errores

### Error 400 - Bad Request

**Datos inválidos en la creación:**

```json
{
  "statusCode": 400,
  "message": [
    "customerName should not be empty",
    "customerPhone should not be empty",
    "date must be a valid ISO 8601 date string",
    "partySize must not be less than 1"
  ],
  "error": "Bad Request"
}
```

### Error 404 - Not Found

```json
{
  "statusCode": 404,
  "message": "Reservation with ID res_999 not found",
  "error": "Not Found"
}
```

### Error 403 - Forbidden

```json
{
  "statusCode": 403,
  "message": "You do not have access to this restaurant",
  "error": "Forbidden"
}
```

---

## 🔐 Seguridad

Todos los endpoints requieren autenticación mediante JWT:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

El backend valida que el usuario autenticado sea dueño del restaurante especificado en la URL.

---

## 💡 Tips de Integración

### 1. Listar Reservas de Hoy para el Dashboard

```typescript
const today = new Date().toISOString().split('T')[0]; // "2025-11-27"
const response = await fetch(
  `/api/restaurants/${restaurantId}/reservations?date=${today}`,
  {
    headers: { Authorization: `Bearer ${token}` },
  },
);
const { reservations, count } = await response.json();
```

### 2. Crear Reserva desde Formulario

```typescript
const createReservation = async (formData) => {
  const response = await fetch(
    `/api/restaurants/${restaurantId}/reservations`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formData),
    },
  );
  return response.json();
};
```

### 3. Actualizar Estado con Un Click

```typescript
const confirmReservation = async (reservationId) => {
  const response = await fetch(
    `/api/restaurants/${restaurantId}/reservations/${reservationId}/status/CONFIRMED`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.json();
};
```

---

## ✅ Checklist de Testing

- [ ] Crear reserva sin mesa asignada
- [ ] Crear reserva con mesa específica
- [ ] Listar reservas del día actual
- [ ] Filtrar por estado (PENDING, CONFIRMED, etc.)
- [ ] Actualizar datos de reserva
- [ ] Cambiar estado paso a paso (PENDING → CONFIRMED → SEATED → COMPLETED)
- [ ] Cancelar reserva (status CANCELLED)
- [ ] Marcar como NO_SHOW
- [ ] Eliminar reserva
- [ ] Verificar que solo el dueño del restaurante puede acceder

---

**Implementado:** 27 de noviembre de 2025  
**Backend Status:** 🟢 Production Ready
