# Kitchen SSE API - Notificaciones en Tiempo Real

## Descripción

El endpoint de SSE (Server-Sent Events) de cocina permite recibir notificaciones en tiempo real sobre cambios en los pedidos de un restaurante. Estas notificaciones se emiten automáticamente cuando el estado de un pedido cambia.

## Endpoints

### Notificaciones SSE

```
GET /api/restaurants/:restaurantId/kitchen/notifications
```

### Obtener Órdenes para Cocina

```
GET /api/restaurants/:restaurantId/kitchen/orders
```

Este endpoint devuelve las órdenes que están en estados relevantes para la cocina: `CONFIRMED`, `PREPARING`, `READY`. Utiliza los mismos filtros que el endpoint general de órdenes, pero fuerza el filtro de status.

**Parámetros de Query:**

- `page`: Número de página (default: 1)
- `limit`: Límite de resultados (default: 50)
- `date`: Filtrar por fecha específica (YYYY-MM-DD)
- `startDate`: Fecha de inicio (YYYY-MM-DD)
- `endDate`: Fecha de fin (YYYY-MM-DD)

**Respuesta:**

```json
{
  "orders": [...],
  "pagination": {...},
  "stats": {...}
}
```

## Autenticación

El endpoint requiere autenticación JWT mediante el header `Authorization`:

```
Authorization: Bearer <JWT_TOKEN>
```

### Validaciones de Seguridad

1. El token JWT debe ser válido y no estar expirado
2. El usuario debe pertenecer al restaurante especificado en el `:restaurantId`
3. Los usuarios con rol `SUPER_ADMIN` tienen acceso a todos los restaurantes

## Formato de Respuesta

Las notificaciones se envían en formato Server-Sent Events (SSE) con la siguiente estructura:

```
event: <event_type>
id: <order_id>
data: <json_payload>
```

### Tipos de Eventos

- `order_created`: Se crea un nuevo pedido y pasa a estado CONFIRMED
- `order_updated`: El estado de un pedido cambia (PREPARING, READY, etc.)
- `order_cancelled`: Un pedido es cancelado

### Estructura del Payload (data)

```json
{
  "type": "order_created" | "order_updated" | "order_cancelled",
  "orderId": "string",
  "restaurantId": "string",
  "timestamp": "ISO8601",
  "data": {
    "orderNumber": "string",
    "status": "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED",
    "customerName": "string",
    "type": "DINE_IN" | "PICKUP" | "DELIVERY",
    "items": [
      {
        "name": "string",
        "quantity": number,
        "notes": "string | null"
      }
    ],
    "total": number,
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

## Estados que Generan Notificaciones

Las notificaciones SSE se emiten automáticamente cuando un pedido cambia a uno de los siguientes estados:

- ✅ **CONFIRMED**: Pedido confirmado y listo para preparar
- 👨‍🍳 **PREPARING**: Pedido en preparación
- 🍽️ **READY**: Pedido listo para entregar/servir
- ❌ **CANCELLED**: Pedido cancelado

**Nota**: Los estados `PENDING` y `PAID` NO generan notificaciones SSE ya que son estados previos a la confirmación del pedido.

## Ejemplos de Uso

### JavaScript / TypeScript (Frontend)

```typescript
const restaurantId = 'your-restaurant-id';
const token = 'your-jwt-token';

const eventSource = new EventSource(
  `/api/restaurants/${restaurantId}/kitchen/notifications`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
);

// Escuchar eventos de pedido creado
eventSource.addEventListener('order_created', (event) => {
  const notification = JSON.parse(event.data);
  console.log('Nuevo pedido:', notification.data.orderNumber);
  console.log('Estado:', notification.data.status);
  console.log('Items:', notification.data.items);
});

// Escuchar eventos de pedido actualizado
eventSource.addEventListener('order_updated', (event) => {
  const notification = JSON.parse(event.data);
  console.log('Pedido actualizado:', notification.data.orderNumber);
  console.log('Nuevo estado:', notification.data.status);
});

// Escuchar eventos de pedido cancelado
eventSource.addEventListener('order_cancelled', (event) => {
  const notification = JSON.parse(event.data);
  console.log('Pedido cancelado:', notification.data.orderNumber);
});

// Manejar errores
eventSource.onerror = (error) => {
  console.error('Error en conexión SSE:', error);
  eventSource.close();
};

// Cerrar conexión cuando sea necesario
// eventSource.close();
```

### React Hook Personalizado

```typescript
import { useEffect, useState } from 'react';

interface KitchenNotification {
  type: 'order_created' | 'order_updated' | 'order_cancelled';
  orderId: string;
  restaurantId: string;
  timestamp: string;
  data: {
    orderNumber: string;
    status: string;
    customerName: string;
    type: string;
    items: any[];
    total: number;
    createdAt: string;
    updatedAt: string;
  };
}

export function useKitchenNotifications(restaurantId: string, token: string) {
  const [notifications, setNotifications] = useState<KitchenNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/restaurants/${restaurantId}/kitchen/notifications`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    const handleNotification = (event: MessageEvent) => {
      const notification: KitchenNotification = JSON.parse(event.data);
      setNotifications(prev => [notification, ...prev]);
    };

    eventSource.addEventListener('order_created', handleNotification);
    eventSource.addEventListener('order_updated', handleNotification);
    eventSource.addEventListener('order_cancelled', handleNotification);

    eventSource.onerror = (err) => {
      setIsConnected(false);
      setError(new Error('Error en conexión SSE'));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [restaurantId, token]);

  return { notifications, isConnected, error };
}

// Uso del hook
function KitchenDashboard() {
  const { notifications, isConnected, error } = useKitchenNotifications(
    restaurantId,
    authToken
  );

  return (
    <div>
      <h1>Kitchen Dashboard</h1>
      {isConnected && <div className="status-connected">✅ Conectado</div>}
      {error && <div className="status-error">❌ {error.message}</div>}

      <div className="notifications">
        {notifications.map(notif => (
          <div key={`${notif.orderId}-${notif.timestamp}`}>
            <h3>{notif.data.orderNumber}</h3>
            <p>Estado: {notif.data.status}</p>
            <p>Cliente: {notif.data.customerName}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### cURL (Testing)

```bash
# Conectar al endpoint SSE
curl -N \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:4000/api/restaurants/RESTAURANT_ID/kitchen/notifications"
```

### Axios / Fetch (No Recomendado)

**Nota**: EventSource es la forma nativa y recomendada para SSE. Axios y fetch requieren configuración adicional y no son ideales para SSE.

## Reconexión Automática

El navegador reconecta automáticamente si la conexión SSE se pierde. Sin embargo, puedes implementar tu propia lógica de reconexión:

```typescript
function createKitchenSSE(restaurantId: string, token: string, maxRetries = 5) {
  let retries = 0;
  let eventSource: EventSource | null = null;

  function connect() {
    eventSource = new EventSource(
      `/api/restaurants/${restaurantId}/kitchen/notifications`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    eventSource.onopen = () => {
      console.log('✅ Conexión SSE establecida');
      retries = 0; // Reset contador de reintentos
    };

    eventSource.onerror = (error) => {
      console.error('❌ Error en SSE:', error);
      eventSource?.close();

      if (retries < maxRetries) {
        retries++;
        const delay = Math.min(1000 * Math.pow(2, retries), 30000); // Exponential backoff
        console.log(`Reintentando en ${delay}ms... (${retries}/${maxRetries})`);
        setTimeout(connect, delay);
      } else {
        console.error('Máximo de reintentos alcanzado');
      }
    };

    return eventSource;
  }

  return connect();
}
```

## Monitoreo y Debugging

### Logs del Servidor

El servidor registra las siguientes acciones:

```
✅ Conexión SSE autorizada para restaurante {id} - Usuario: {email}
📡 Nueva conexión SSE para restaurante {id}. Total: {count}
📤 Enviando notificación SSE: {type} - Order: {orderId}
❌ Conexión SSE cerrada para restaurante {id}. Restantes: {count}
```

### Verificar Conexiones Activas

Puedes verificar las conexiones activas revisando los logs del contenedor:

```bash
docker logs resto-backend | grep "SSE\|Kitchen"
```

## Consideraciones de Rendimiento

1. **Límite de Conexiones**: El navegador limita las conexiones SSE simultáneas (típicamente 6 por dominio)
2. **Keep-Alive**: El servidor envía mensajes keep-alive automáticamente para mantener la conexión
3. **Cierre de Conexión**: Siempre cierra las conexiones SSE cuando no las necesites para liberar recursos

## Troubleshooting

### Error: "Se requiere token de autenticación"

- Verifica que estés enviando el header `Authorization: Bearer <token>`
- Asegúrate de que el token no esté expirado

### Error: "No tienes acceso a las notificaciones de este restaurante"

- El restaurantId en la URL debe coincidir con el restaurantId del token JWT
- Los usuarios SUPER_ADMIN tienen acceso a todos los restaurantes

### No se reciben notificaciones

- Verifica que la conexión SSE esté establecida correctamente
- Confirma que los pedidos estén cambiando a estados que generan notificaciones (CONFIRMED, PREPARING, READY, CANCELLED)
- Revisa los logs del servidor para ver si las notificaciones se están emitiendo

### Conexión se cierra inmediatamente

- Verifica que el token JWT sea válido
- Asegúrate de que el navegador soporte SSE
- Revisa que no haya problemas de red o proxies bloqueando las conexiones SSE

## Arquitectura Técnica

### Componentes

1. **KitchenController** (`src/kitchen/kitchen.controller.ts`)
   - Endpoint SSE con autenticación JWT manual
   - Validación de permisos de acceso al restaurante

2. **KitchenNotificationsService** (`src/kitchen/kitchen-notifications.service.ts`)
   - Gestión de conexiones SSE por restaurante usando RxJS Subjects
   - Broadcast de notificaciones a todas las conexiones activas
   - Limpieza automática de conexiones inactivas

3. **OrdersService** (`src/orders/orders.service.ts`)
   - Emisión de notificaciones al cambiar estado de pedidos
   - Integración con KitchenNotificationsService

### Flujo de Datos

```
Cliente → SSE Connection → KitchenController
                               ↓
                    JWT Validation
                               ↓
                KitchenNotificationsService
                               ↓
                    Observable<MessageEvent>
                               ↑
    OrdersService → emitKitchenNotification
```

## Seguridad

- ✅ Autenticación JWT obligatoria
- ✅ Validación de permisos por restaurante
- ✅ Bypass del guard global solo para verificación manual
- ✅ Logs de acceso y actividad
- ✅ Cierre automático de conexiones no autorizadas

## Ejemplo Completo

Ver el archivo de prueba en `test-kitchen-sse.html` para un ejemplo completo funcional.
