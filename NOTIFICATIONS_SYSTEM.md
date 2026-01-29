# Sistema de Notificaciones

## Descripción

El sistema de notificaciones permite enviar notificaciones a usuarios del sistema a través de múltiples canales: aplicación interna, email y SSE (Server-Sent Events). Las notificaciones se almacenan en la base de datos y pueden ser gestionadas por los usuarios.

## Modelo de Datos

### Notification

```prisma
model Notification {
  id          String   @id @default(cuid())
  userId      String
  restaurantId String?
  type        NotificationType
  title       String
  message     String
  data        Json? // Additional data for the notification
  isRead      Boolean  @default(false)
  priority    NotificationPriority @default(NORMAL)
  channels    NotificationChannel[] // Channels to send: EMAIL, PUSH, IN_APP, SSE

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  restaurant Restaurant? @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([restaurantId])
  @@index([isRead])
  @@index([createdAt])
}
```

### Enums

```prisma
enum NotificationType {
  ORDER_CREATED
  ORDER_UPDATED
  ORDER_CANCELLED
  ORDER_READY
  PAYMENT_SUCCESS
  PAYMENT_FAILED
  RESERVATION_CONFIRMED
  RESERVATION_CANCELLED
  SUBSCRIPTION_EXPIRED
  SUBSCRIPTION_RENEWED
  SYSTEM_MAINTENANCE
  CUSTOM
}

enum NotificationPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

enum NotificationChannel {
  EMAIL
  PUSH
  IN_APP
  SSE
}
```

## API Endpoints

### Obtener Notificaciones

```
GET /api/notifications
```

**Parámetros de Query:**

- `isRead` (boolean): Filtrar por estado de lectura
- `type` (NotificationType): Filtrar por tipo
- `restaurantId` (string): Filtrar por restaurante
- `limit` (number): Límite de resultados (default: 50)
- `offset` (number): Offset para paginación

**Respuesta:**

```json
[
  {
    "id": "string",
    "userId": "string",
    "restaurantId": "string",
    "type": "ORDER_CREATED",
    "title": "Nuevo pedido recibido",
    "message": "Se ha recibido un nuevo pedido #OD-20240128-001",
    "data": { ... },
    "isRead": false,
    "priority": "NORMAL",
    "channels": ["IN_APP", "EMAIL"],
    "createdAt": "2024-01-28T10:00:00Z",
    "updatedAt": "2024-01-28T10:00:00Z"
  }
]
```

### Obtener Conteo de No Leídas

```
GET /api/notifications/unread-count
```

**Parámetros de Query:**

- `restaurantId` (string): Filtrar por restaurante

**Respuesta:**

```json
{
  "count": 5
}
```

### Marcar como Leída

```
PUT /api/notifications/:id/read
```

**Respuesta:**

```json
{
  "id": "string",
  "isRead": true,
  ...
}
```

### Marcar Todas como Leídas

```
PUT /api/notifications/mark-all-read
```

**Parámetros de Query:**

- `restaurantId` (string): Filtrar por restaurante

**Respuesta:**

```json
{
  "markedCount": 10
}
```

### Eliminar Notificación

```
DELETE /api/notifications/:id
```

## Integración con Pedidos

El sistema de notificaciones se integra automáticamente con el sistema de pedidos. Cuando un pedido cambia de estado, se envían notificaciones a todos los usuarios activos del restaurante.

### Estados que Generan Notificaciones

- `CONFIRMED`: ORDER_CREATED
- `PREPARING`: ORDER_UPDATED
- `READY`: ORDER_READY
- `CANCELLED`: ORDER_CANCELLED

### Canales de Envío

Por defecto, las notificaciones de pedidos se envían por:

- `IN_APP`: Almacenadas en la base de datos
- `EMAIL`: Enviadas por email al usuario

## Servicio de Notificaciones

### Crear Notificación

```typescript
const notification = await notificationsService.createAndSend({
  userId: 'user-id',
  restaurantId: 'restaurant-id',
  type: NotificationType.ORDER_CREATED,
  title: 'Nuevo pedido recibido',
  message: 'Se ha recibido un nuevo pedido #OD-20240128-001',
  data: { orderNumber: 'OD-20240128-001', total: 1500 },
  channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
});
```

### Crear Notificación de Pedido (Helper)

```typescript
await notificationsService.createOrderNotification(
  userId,
  restaurantId,
  orderId,
  'ORDER_CREATED',
  {
    orderNumber: 'OD-20240128-001',
    status: OrderStatus.CONFIRMED,
    customerName: 'Juan Pérez',
    type: OrderType.DINE_IN,
    total: 1500,
  },
);
```

## Canales de Notificación

### In-App (Base de Datos)

Las notificaciones se almacenan en la tabla `Notification` y pueden ser consultadas a través de la API.

### Email

Las notificaciones se envían usando el servicio de email configurado (Resend). El template incluye:

- Título de la notificación
- Mensaje
- Datos adicionales en formato JSON

### SSE (Server-Sent Events)

Para notificaciones en tiempo real, se puede integrar con el sistema SSE existente para cocina.

### Push Notifications (Futuro)

Pendiente de implementación para notificaciones push móviles.

## Próximas Mejoras

1. **Push Notifications**: Implementar envío de notificaciones push a dispositivos móviles
2. **Templates de Email**: Crear templates HTML más elaborados
3. **Configuración por Usuario**: Permitir que los usuarios configuren qué tipos de notificaciones recibir
4. **Notificaciones Programadas**: Sistema para enviar notificaciones en fechas específicas
5. **Webhooks**: Permitir que sistemas externos reciban notificaciones vía webhooks

## Testing

Para probar el sistema de notificaciones:

1. Crear un pedido y verificar que se envíen notificaciones a los usuarios del restaurante
2. Verificar que las notificaciones aparezcan en la API
3. Verificar el envío de emails
4. Probar marcar notificaciones como leídas
