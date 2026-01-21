# Integración Frontend - Kitchen SSE API

## 📋 Índice

1. [Especificación del Endpoint](#especificación-del-endpoint)
2. [Formato de Petición](#formato-de-petición)
3. [Formato de Respuesta](#formato-de-respuesta)
4. [TypeScript Types](#typescript-types)
5. [Implementaciones](#implementaciones)
   - [JavaScript Vanilla](#javascript-vanilla)
   - [React (Hooks)](#react-hooks)
   - [Vue 3 (Composition API)](#vue-3-composition-api)
   - [Angular](#angular)
   - [Next.js](#nextjs)
6. [Manejo de Errores](#manejo-de-errores)
7. [Testing](#testing)

---

## Especificación del Endpoint

### Endpoint SSE de Notificaciones de Cocina

```
GET /api/restaurants/:restaurantId/kitchen/notifications
```

**Método**: `GET`  
**Protocolo**: Server-Sent Events (SSE)  
**Content-Type Respuesta**: `text/event-stream`  
**Autenticación**: JWT Bearer Token (requerido)

### Parámetros

#### Path Parameters

| Parámetro      | Tipo   | Requerido | Descripción                                        |
| -------------- | ------ | --------- | -------------------------------------------------- |
| `restaurantId` | string | Sí        | ID del restaurante del cual recibir notificaciones |

#### Headers

| Header          | Valor                | Requerido   | Descripción                |
| --------------- | -------------------- | ----------- | -------------------------- |
| `Authorization` | `Bearer <JWT_TOKEN>` | Sí          | Token JWT de autenticación |
| `Accept`        | `text/event-stream`  | Recomendado | Indica que se espera SSE   |

---

## Formato de Petición

### URL Completa

```
http://localhost:4000/api/restaurants/{restaurantId}/kitchen/notifications
```

**Producción**:

```
https://api.turestaurante.com/api/restaurants/{restaurantId}/kitchen/notifications
```

### Headers de Petición

```http
GET /api/restaurants/cmkm5sun9000001kygwrs996s/kitchen/notifications HTTP/1.1
Host: localhost:4000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: text/event-stream
Cache-Control: no-cache
```

### Ejemplo cURL

```bash
curl -N \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:4000/api/restaurants/RESTAURANT_ID/kitchen/notifications"
```

---

## Formato de Respuesta

### Estructura SSE

Cada notificación se envía en formato Server-Sent Events:

```
event: <event_type>
id: <order_id>
data: <json_payload>

```

### Tipos de Eventos

| Event Type        | Descripción         | Cuándo se emite                  |
| ----------------- | ------------------- | -------------------------------- |
| `order_created`   | Nuevo pedido creado | Estado cambia a CONFIRMED        |
| `order_updated`   | Pedido actualizado  | Estado cambia a PREPARING, READY |
| `order_cancelled` | Pedido cancelado    | Estado cambia a CANCELLED        |

### Payload de Datos (campo `data`)

```json
{
  "type": "order_created | order_updated | order_cancelled",
  "orderId": "cmkn2ihkw000001ul2mk9je6b",
  "restaurantId": "cmkm5sun9000001kygwrs996s",
  "timestamp": "2026-01-20T20:50:03.015Z",
  "data": {
    "orderNumber": "OD-20260120-007",
    "status": "CONFIRMED | PREPARING | READY | DELIVERED | CANCELLED",
    "customerName": "Juan Pérez",
    "type": "DINE_IN | PICKUP | DELIVERY",
    "items": [
      {
        "name": "Pizza Margarita",
        "quantity": 2,
        "notes": "Sin aceitunas"
      }
    ],
    "total": 1599,
    "createdAt": "2026-01-20T20:50:00.703Z",
    "updatedAt": "2026-01-20T20:50:03.006Z"
  }
}
```

### Ejemplo de Evento Completo

```
event: order_created
id: cmkn2ihkw000001ul2mk9je6b
data: {"type":"order_created","orderId":"cmkn2ihkw000001ul2mk9je6b","data":{"orderNumber":"OD-20260120-007","status":"CONFIRMED","customerName":"Test Real Time","type":"DINE_IN","items":[{"name":"Test Pizza","quantity":1,"notes":null}],"total":1599,"createdAt":"2026-01-20T20:50:00.703Z","updatedAt":"2026-01-20T20:50:03.006Z"},"restaurantId":"cmkm5sun9000001kygwrs996s","timestamp":"2026-01-20T20:50:03.015Z"}

event: order_updated
id: cmkn2ihkw000001ul2mk9je6b
data: {"type":"order_updated","orderId":"cmkn2ihkw000001ul2mk9je6b","data":{"orderNumber":"OD-20260120-007","status":"PREPARING","customerName":"Test Real Time","type":"DINE_IN","items":[{"name":"Test Pizza","quantity":1,"notes":null}],"total":1599,"createdAt":"2026-01-20T20:50:00.703Z","updatedAt":"2026-01-20T20:50:04.099Z"},"restaurantId":"cmkm5sun9000001kygwrs996s","timestamp":"2026-01-20T20:50:04.105Z"}

```

---

## TypeScript Types

```typescript
// types/kitchen-sse.ts

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export type OrderType = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

export type NotificationType =
  | 'order_created'
  | 'order_updated'
  | 'order_cancelled';

export interface OrderItem {
  name: string;
  quantity: number;
  notes: string | null;
}

export interface OrderData {
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  type: OrderType;
  items: OrderItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface KitchenNotification {
  type: NotificationType;
  orderId: string;
  restaurantId: string;
  timestamp: string;
  data: OrderData;
}

export interface SSEMessageEvent extends MessageEvent {
  data: string;
  type: NotificationType;
  id: string;
}
```

---

## Implementaciones

### JavaScript Vanilla

```javascript
// kitchen-sse-client.js

class KitchenSSEClient {
  constructor(restaurantId, token) {
    this.restaurantId = restaurantId;
    this.token = token;
    this.eventSource = null;
    this.listeners = {
      order_created: [],
      order_updated: [],
      order_cancelled: [],
      connected: [],
      disconnected: [],
      error: [],
    };
  }

  connect() {
    const url = `${this.getBaseUrl()}/api/restaurants/${this.restaurantId}/kitchen/notifications`;

    // Crear EventSource con autenticación
    // NOTA: EventSource nativo no soporta headers personalizados
    // Necesitas usar un polyfill o proxy para producción
    this.eventSource = new EventSource(url);

    // Evento de conexión establecida
    this.eventSource.onopen = () => {
      console.log('✅ SSE conectado');
      this.emit('connected');
    };

    // Escuchar eventos de orden creada
    this.eventSource.addEventListener('order_created', (event) => {
      const notification = JSON.parse(event.data);
      this.emit('order_created', notification);
    });

    // Escuchar eventos de orden actualizada
    this.eventSource.addEventListener('order_updated', (event) => {
      const notification = JSON.parse(event.data);
      this.emit('order_updated', notification);
    });

    // Escuchar eventos de orden cancelada
    this.eventSource.addEventListener('order_cancelled', (event) => {
      const notification = JSON.parse(event.data);
      this.emit('order_cancelled', notification);
    });

    // Manejo de errores
    this.eventSource.onerror = (error) => {
      console.error('❌ Error SSE:', error);
      this.emit('error', error);
      this.emit('disconnected');

      // Auto-reconexión (opcional)
      if (this.eventSource.readyState === EventSource.CLOSED) {
        setTimeout(() => this.connect(), 5000);
      }
    };

    return this;
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.emit('disconnected');
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (cb) => cb !== callback,
      );
    }
    return this;
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(data));
    }
  }

  getBaseUrl() {
    return process.env.API_URL || 'http://localhost:4000';
  }
}

// Uso
const client = new KitchenSSEClient(
  'cmkm5sun9000001kygwrs996s',
  'your-jwt-token',
);

client
  .on('connected', () => {
    console.log('Conectado al servidor');
  })
  .on('order_created', (notification) => {
    console.log('Nuevo pedido:', notification.data.orderNumber);
    // Actualizar UI
  })
  .on('order_updated', (notification) => {
    console.log('Pedido actualizado:', notification.data.orderNumber);
    console.log('Nuevo estado:', notification.data.status);
    // Actualizar UI
  })
  .on('order_cancelled', (notification) => {
    console.log('Pedido cancelado:', notification.data.orderNumber);
    // Actualizar UI
  })
  .on('error', (error) => {
    console.error('Error:', error);
  })
  .connect();

// Limpiar al cerrar
window.addEventListener('beforeunload', () => {
  client.disconnect();
});
```

---

### React (Hooks)

#### Hook Personalizado

```typescript
// hooks/useKitchenSSE.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import type { KitchenNotification } from '../types/kitchen-sse';

interface UseKitchenSSEOptions {
  restaurantId: string;
  token: string;
  autoConnect?: boolean;
  maxRetries?: number;
}

interface UseKitchenSSEReturn {
  notifications: KitchenNotification[];
  isConnected: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  clearNotifications: () => void;
}

export function useKitchenSSE({
  restaurantId,
  token,
  autoConnect = true,
  maxRetries = 5,
}: UseKitchenSSEOptions): UseKitchenSSEReturn {
  const [notifications, setNotifications] = useState<KitchenNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      return; // Ya conectado
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/restaurants/${restaurantId}/kitchen/notifications`;

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('✅ SSE conectado');
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      const handleNotification = (event: MessageEvent) => {
        const notification: KitchenNotification = JSON.parse(event.data);
        setNotifications((prev) => [notification, ...prev]);
      };

      eventSource.addEventListener('order_created', handleNotification);
      eventSource.addEventListener('order_updated', handleNotification);
      eventSource.addEventListener('order_cancelled', handleNotification);

      eventSource.onerror = () => {
        console.error('❌ Error en SSE');
        setIsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Auto-reconexión con backoff exponencial
        if (retriesRef.current < maxRetries) {
          retriesRef.current++;
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
          console.log(`🔄 Reintentando en ${delay}ms...`);
          setTimeout(connect, delay);
        } else {
          setError(new Error('Máximo de reintentos alcanzado'));
        }
      };
    } catch (err) {
      setError(err as Error);
      setIsConnected(false);
    }
  }, [restaurantId, token, maxRetries]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    notifications,
    isConnected,
    error,
    connect,
    disconnect,
    clearNotifications,
  };
}
```

#### Componente de Ejemplo

```typescript
// components/KitchenDashboard.tsx
import React from 'react';
import { useKitchenSSE } from '../hooks/useKitchenSSE';
import { OrderCard } from './OrderCard';

interface KitchenDashboardProps {
  restaurantId: string;
  token: string;
}

export function KitchenDashboard({ restaurantId, token }: KitchenDashboardProps) {
  const {
    notifications,
    isConnected,
    error,
    clearNotifications
  } = useKitchenSSE({
    restaurantId,
    token,
    autoConnect: true
  });

  return (
    <div className="kitchen-dashboard">
      {/* Header con estado de conexión */}
      <header className="dashboard-header">
        <h1>🍳 Cocina - Pedidos en Tiempo Real</h1>
        <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? (
            <>
              <span className="indicator">🟢</span>
              <span>Conectado</span>
            </>
          ) : (
            <>
              <span className="indicator">⚫</span>
              <span>Desconectado</span>
            </>
          )}
        </div>
        <button onClick={clearNotifications}>Limpiar</button>
      </header>

      {/* Mensajes de error */}
      {error && (
        <div className="error-banner">
          ⚠️ Error: {error.message}
        </div>
      )}

      {/* Lista de notificaciones */}
      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="empty-state">
            <p>No hay pedidos pendientes</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <OrderCard
              key={`${notification.orderId}-${notification.timestamp}`}
              notification={notification}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

```typescript
// components/OrderCard.tsx
import React from 'react';
import type { KitchenNotification } from '../types/kitchen-sse';

interface OrderCardProps {
  notification: KitchenNotification;
}

export function OrderCard({ notification }: OrderCardProps) {
  const { data, type, timestamp } = notification;

  const getStatusColor = (status: string) => {
    const colors = {
      CONFIRMED: 'bg-blue-100 text-blue-800',
      PREPARING: 'bg-yellow-100 text-yellow-800',
      READY: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100';
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      order_created: '📦',
      order_updated: '🔄',
      order_cancelled: '❌'
    };
    return icons[type as keyof typeof icons] || '📝';
  };

  return (
    <div className="order-card">
      <div className="card-header">
        <span className="type-badge">{getTypeIcon(type)} {type}</span>
        <span className="timestamp">
          {new Date(timestamp).toLocaleTimeString('es-AR')}
        </span>
      </div>

      <h3 className="order-number">{data.orderNumber}</h3>

      <span className={`status-badge ${getStatusColor(data.status)}`}>
        {data.status}
      </span>

      <div className="order-details">
        <p><strong>Cliente:</strong> {data.customerName}</p>
        <p><strong>Tipo:</strong> {data.type}</p>
        <p><strong>Total:</strong> ${(data.total / 100).toFixed(2)}</p>
      </div>

      <div className="order-items">
        <strong>Items:</strong>
        {data.items.map((item, index) => (
          <div key={index} className="item">
            <span>{item.quantity}x {item.name}</span>
            {item.notes && <small>{item.notes}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Vue 3 (Composition API)

#### Composable

```typescript
// composables/useKitchenSSE.ts
import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import type { KitchenNotification } from '@/types/kitchen-sse';

interface UseKitchenSSEOptions {
  restaurantId: string;
  token: string;
  autoConnect?: boolean;
}

export function useKitchenSSE(options: UseKitchenSSEOptions) {
  const { restaurantId, token, autoConnect = true } = options;

  const notifications: Ref<KitchenNotification[]> = ref([]);
  const isConnected = ref(false);
  const error: Ref<Error | null> = ref(null);

  let eventSource: EventSource | null = null;

  const connect = () => {
    if (eventSource) return;

    const url = `${import.meta.env.VITE_API_URL}/api/restaurants/${restaurantId}/kitchen/notifications`;

    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log('✅ SSE conectado');
      isConnected.value = true;
      error.value = null;
    };

    const handleNotification = (event: MessageEvent) => {
      const notification: KitchenNotification = JSON.parse(event.data);
      notifications.value.unshift(notification);
    };

    eventSource.addEventListener('order_created', handleNotification);
    eventSource.addEventListener('order_updated', handleNotification);
    eventSource.addEventListener('order_cancelled', handleNotification);

    eventSource.onerror = () => {
      console.error('❌ Error en SSE');
      isConnected.value = false;
      disconnect();

      // Auto-reconexión
      setTimeout(connect, 5000);
    };
  };

  const disconnect = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      isConnected.value = false;
    }
  };

  const clearNotifications = () => {
    notifications.value = [];
  };

  onMounted(() => {
    if (autoConnect) {
      connect();
    }
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    notifications,
    isConnected,
    error,
    connect,
    disconnect,
    clearNotifications,
  };
}
```

#### Componente

```vue
<!-- components/KitchenDashboard.vue -->
<template>
  <div class="kitchen-dashboard">
    <header class="dashboard-header">
      <h1>🍳 Cocina - Pedidos en Tiempo Real</h1>

      <div :class="['status', { connected: isConnected }]">
        <span class="indicator">{{ isConnected ? '🟢' : '⚫' }}</span>
        <span>{{ isConnected ? 'Conectado' : 'Desconectado' }}</span>
      </div>

      <button @click="clearNotifications">Limpiar</button>
    </header>

    <div v-if="error" class="error-banner">⚠️ Error: {{ error.message }}</div>

    <div class="notifications-list">
      <div v-if="notifications.length === 0" class="empty-state">
        <p>No hay pedidos pendientes</p>
      </div>

      <OrderCard
        v-for="notification in notifications"
        :key="`${notification.orderId}-${notification.timestamp}`"
        :notification="notification"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useKitchenSSE } from '@/composables/useKitchenSSE';
import OrderCard from './OrderCard.vue';

interface Props {
  restaurantId: string;
  token: string;
}

const props = defineProps<Props>();

const { notifications, isConnected, error, clearNotifications } = useKitchenSSE(
  {
    restaurantId: props.restaurantId,
    token: props.token,
  },
);
</script>

<style scoped>
.kitchen-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  background: #f8d7da;
  color: #721c24;
}

.status.connected {
  background: #d4edda;
  color: #155724;
}
</style>
```

---

### Angular

#### Service

```typescript
// services/kitchen-sse.service.ts
import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject, fromEvent } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { KitchenNotification } from '../models/kitchen-sse.model';

@Injectable({
  providedIn: 'root',
})
export class KitchenSSEService {
  private eventSource: EventSource | null = null;
  private destroy$ = new Subject<void>();

  constructor(private ngZone: NgZone) {}

  connect(
    restaurantId: string,
    token: string,
  ): Observable<KitchenNotification> {
    return new Observable((observer) => {
      const url = `${environment.apiUrl}/api/restaurants/${restaurantId}/kitchen/notifications`;

      this.ngZone.runOutsideAngular(() => {
        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
          this.ngZone.run(() => {
            console.log('✅ SSE conectado');
          });
        };

        const handleEvent = (event: MessageEvent) => {
          this.ngZone.run(() => {
            const notification: KitchenNotification = JSON.parse(event.data);
            observer.next(notification);
          });
        };

        this.eventSource.addEventListener('order_created', handleEvent);
        this.eventSource.addEventListener('order_updated', handleEvent);
        this.eventSource.addEventListener('order_cancelled', handleEvent);

        this.eventSource.onerror = (error) => {
          this.ngZone.run(() => {
            console.error('❌ Error en SSE:', error);
            observer.error(error);
          });
        };
      });

      return () => {
        this.disconnect();
      };
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.destroy$.next();
  }
}
```

#### Component

```typescript
// components/kitchen-dashboard/kitchen-dashboard.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { KitchenSSEService } from '../../services/kitchen-sse.service';
import { KitchenNotification } from '../../models/kitchen-sse.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-kitchen-dashboard',
  templateUrl: './kitchen-dashboard.component.html',
  styleUrls: ['./kitchen-dashboard.component.scss'],
})
export class KitchenDashboardComponent implements OnInit, OnDestroy {
  notifications: KitchenNotification[] = [];
  isConnected = false;
  error: Error | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private kitchenSSE: KitchenSSEService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const restaurantId = this.authService.getRestaurantId();
    const token = this.authService.getToken();

    this.kitchenSSE
      .connect(restaurantId, token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (notification) => {
          this.notifications.unshift(notification);
          this.isConnected = true;
          this.error = null;
        },
        error: (error) => {
          this.isConnected = false;
          this.error = error;
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.kitchenSSE.disconnect();
  }

  clearNotifications(): void {
    this.notifications = [];
  }
}
```

---

### Next.js

#### API Route Proxy (para manejar headers de autenticación)

```typescript
// pages/api/kitchen/sse/[restaurantId].ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { restaurantId } = req.query;
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const apiUrl = process.env.API_URL || 'http://localhost:4000';
  const url = `${apiUrl}/api/restaurants/${restaurantId}/kitchen/notifications`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: token,
        Accept: 'text/event-stream',
      },
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream de respuesta
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No se pudo obtener el reader');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (error) {
    console.error('Error en SSE proxy:', error);
    res.status(500).json({ error: 'Error al conectar con SSE' });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
```

#### Page Component

```typescript
// pages/kitchen/dashboard.tsx
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { KitchenNotification } from '@/types/kitchen-sse';

export default function KitchenDashboard() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<KitchenNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!session?.user?.restaurantId || !session?.accessToken) {
      return;
    }

    const restaurantId = session.user.restaurantId;
    const eventSource = new EventSource(
      `/api/kitchen/sse/${restaurantId}`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`
        }
      }
    );

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    const handleNotification = (event: MessageEvent) => {
      const notification: KitchenNotification = JSON.parse(event.data);
      setNotifications(prev => [notification, ...prev]);
    };

    eventSource.addEventListener('order_created', handleNotification);
    eventSource.addEventListener('order_updated', handleNotification);
    eventSource.addEventListener('order_cancelled', handleNotification);

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [session]);

  return (
    <div>
      <h1>Kitchen Dashboard</h1>
      <div>Estado: {isConnected ? 'Conectado' : 'Desconectado'}</div>
      {/* Renderizar notificaciones */}
    </div>
  );
}
```

---

## Manejo de Errores

### Errores Comunes

| Error             | Código | Causa                            | Solución               |
| ----------------- | ------ | -------------------------------- | ---------------------- |
| Unauthorized      | 401    | Token inválido o expirado        | Renovar token JWT      |
| Forbidden         | 403    | Sin permisos para el restaurante | Verificar restaurantId |
| Not Found         | 404    | Endpoint incorrecto              | Verificar URL          |
| Connection Failed | -      | Error de red                     | Verificar conectividad |

### Implementación de Retry Logic

```typescript
class SSEConnectionManager {
  private maxRetries = 5;
  private retryCount = 0;
  private eventSource: EventSource | null = null;

  connect(url: string) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('✅ Conectado');
      this.retryCount = 0; // Reset
    };

    this.eventSource.onerror = () => {
      console.error('❌ Error de conexión');
      this.eventSource?.close();

      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        console.log(
          `🔄 Reintentando en ${delay}ms (${this.retryCount}/${this.maxRetries})`,
        );
        setTimeout(() => this.connect(url), delay);
      } else {
        console.error('❌ Máximo de reintentos alcanzado');
      }
    };
  }

  disconnect() {
    this.eventSource?.close();
    this.eventSource = null;
    this.retryCount = 0;
  }
}
```

---

## Testing

### Jest + React Testing Library

```typescript
// __tests__/useKitchenSSE.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useKitchenSSE } from '../hooks/useKitchenSSE';

// Mock EventSource
global.EventSource = jest.fn(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn(),
  onopen: null,
  onerror: null,
})) as any;

describe('useKitchenSSE', () => {
  it('debe conectarse automáticamente', () => {
    const { result } = renderHook(() =>
      useKitchenSSE({
        restaurantId: 'test-restaurant',
        token: 'test-token',
        autoConnect: true,
      }),
    );

    expect(EventSource).toHaveBeenCalled();
  });

  it('debe agregar notificaciones cuando llegan', async () => {
    const { result } = renderHook(() =>
      useKitchenSSE({
        restaurantId: 'test-restaurant',
        token: 'test-token',
      }),
    );

    // Simular llegada de notificación
    // ... test implementation
  });
});
```

---

## Notas Importantes

### Limitaciones de EventSource

⚠️ **EventSource nativo no soporta headers personalizados**

Para producción, considera:

1. **Usar un polyfill**: `eventsource-polyfill` o `event-source-polyfill`
2. **Proxy en backend**: Crear un endpoint proxy que maneje la autenticación
3. **Token en query param** (menos seguro): `?token=JWT_TOKEN`

### Ejemplo con Polyfill

```bash
npm install event-source-polyfill
```

```typescript
import { EventSourcePolyfill } from 'event-source-polyfill';

const eventSource = new EventSourcePolyfill(url, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Performance

- ✅ Las conexiones SSE son ligeras y eficientes
- ✅ El servidor mantiene la conexión abierta (long-polling)
- ✅ Reconexión automática del navegador
- ⚠️ Límite de ~6 conexiones SSE simultáneas por dominio

### Seguridad

- ✅ Siempre usar HTTPS en producción
- ✅ Validar tokens en cada conexión
- ✅ Implementar rate limiting en el servidor
- ✅ No exponer tokens en logs

---

¿Necesitas ayuda con alguna implementación específica?
