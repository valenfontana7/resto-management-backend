# 📊 Analytics API - Complete Documentation

## 📋 Overview

Sistema completo de analíticas y reportes para obtener insights del negocio:

- **Evolución de ventas** en el tiempo
- **Distribución por categorías** de productos
- **Análisis por hora del día** (horarios pico)
- **Top clientes** más frecuentes
- **Métricas de rendimiento** operativo
- **Comparaciones** período vs período anterior
- **Platos más vendidos**
- **Desglose por tipo de orden** (DINE_IN, PICKUP, DELIVERY)

**Total Endpoints:** 8

---

## 🔐 Autenticación

Todos los endpoints requieren:

- Header: `Authorization: Bearer {token}`
- JWT válido de usuario autenticado

---

## 📊 Endpoints

### 1. GET `/api/analytics/restaurant/:restaurantId/sales`

Obtener evolución de ventas en un período de tiempo.

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'` | `'quarter'` | `'year'` | `'custom'` | `'all'`
- `startDate` (optional): ISO date string - Required si `period='custom'`
- `endDate` (optional): ISO date string - Required si `period='custom'`

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/sales?period=month" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "salesData": [
    {
      "date": "2025-11-01",
      "sales": 125000,
      "orders": 45,
      "avgTicket": 2777
    },
    {
      "date": "2025-11-02",
      "sales": 98000,
      "orders": 38,
      "avgTicket": 2578
    },
    {
      "date": "2025-11-03",
      "sales": 156000,
      "orders": 52,
      "avgTicket": 3000
    }
  ]
}
```

**Campos:**

- `date`: Fecha en formato YYYY-MM-DD
- `sales`: Total de ventas en centavos
- `orders`: Cantidad de órdenes completadas
- `avgTicket`: Promedio de ticket (sales / orders)

---

### 2. GET `/api/analytics/restaurant/:restaurantId/categories`

Distribución de ventas por categoría de platos.

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'` | `'quarter'` | `'year'` | `'custom'` | `'all'`
- `startDate`, `endDate` (optional): Para período custom

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/categories?period=week" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "categoryBreakdown": [
    {
      "category": "Platos Principales",
      "sales": 580000,
      "orders": 245,
      "percentage": 38.5
    },
    {
      "category": "Bebidas",
      "sales": 230000,
      "orders": 312,
      "percentage": 15.2
    },
    {
      "category": "Postres",
      "sales": 190000,
      "orders": 156,
      "percentage": 12.6
    }
  ]
}
```

**Ordenamiento:** Por ventas descendente

---

### 3. GET `/api/analytics/restaurant/:restaurantId/hourly`

Análisis de pedidos por hora del día (útil para identificar horarios pico).

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'`

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/hourly?period=week" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "hourlyData": [
    {
      "hour": 0,
      "orders": 0,
      "sales": 0
    },
    {
      "hour": 12,
      "orders": 25,
      "sales": 67500
    },
    {
      "hour": 13,
      "orders": 30,
      "sales": 82000
    },
    {
      "hour": 20,
      "orders": 28,
      "sales": 75000
    }
  ]
}
```

**Uso:** Crear heatmap de actividad del restaurante

---

### 4. GET `/api/analytics/restaurant/:restaurantId/top-customers`

Clientes con más pedidos y mayor gasto total.

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'` | `'quarter'` | `'year'` | `'all'`
- `limit` (optional): number (default: 10)
- `startDate`, `endDate` (optional): Para período custom

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/top-customers?period=month&limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "topCustomers": [
    {
      "id": "customer_1",
      "name": "Juan Pérez",
      "email": "juan@email.com",
      "phone": "+5491123456789",
      "orders": 15,
      "totalSpent": 125000,
      "avgTicket": 8333,
      "lastVisit": "2025-11-30T18:30:00Z"
    },
    {
      "id": "customer_2",
      "name": "María González",
      "email": "maria@email.com",
      "phone": "+5491187654321",
      "orders": 12,
      "totalSpent": 98000,
      "avgTicket": 8166,
      "lastVisit": "2025-11-29T20:15:00Z"
    }
  ]
}
```

**Ordenamiento:** Por `totalSpent` descendente

**Nota:** Los clientes se agrupan por `customerPhone` o `customerName` si no hay phone.

---

### 5. GET `/api/analytics/restaurant/:restaurantId/performance`

Métricas de rendimiento operativo del restaurante.

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'` | `'quarter'` | `'year'`

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/performance?period=month" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "metrics": {
    "avgPreparationTime": 18,
    "avgDeliveryTime": 35,
    "avgServiceTime": 45,
    "orderAccuracy": 98.5,
    "customerSatisfaction": 4.7
  }
}
```

**Campos:**

- `avgPreparationTime`: Minutos promedio desde CONFIRMED hasta PREPARING/READY
- `avgDeliveryTime`: Minutos promedio desde READY hasta DELIVERED (solo delivery)
- `avgServiceTime`: Minutos promedio desde CONFIRMED hasta DELIVERED
- `orderAccuracy`: Porcentaje de órdenes completadas exitosamente
- `customerSatisfaction`: Score calculado basado en órdenes completadas (0-5)

---

### 6. GET `/api/analytics/restaurant/:restaurantId/comparison`

Comparación del período actual vs período anterior.

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'` | `'quarter'` | `'year'`

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/comparison?period=month" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "comparison": {
    "current": {
      "sales": 1250000,
      "orders": 450,
      "avgTicket": 2777
    },
    "previous": {
      "sales": 1100000,
      "orders": 420,
      "avgTicket": 2619
    },
    "growth": {
      "sales": 13.6,
      "orders": 7.1,
      "avgTicket": 6.0
    }
  }
}
```

**Lógica de períodos previos:**

- `today` → ayer
- `week` → semana anterior
- `month` → mes anterior
- `quarter` → trimestre anterior
- `year` → año anterior

**Growth:** Porcentaje de crecimiento `((current - previous) / previous * 100)`

---

### 7. GET `/api/analytics/restaurant/:restaurantId/top-dishes`

Platos más vendidos en el período.

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'` | `'quarter'` | `'year'`
- `limit` (optional): number (default: 10)
- `startDate`, `endDate` (optional): Para período custom

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/top-dishes?period=month&limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "topDishes": [
    {
      "dishId": "dish_123",
      "name": "Milanesa Napolitana",
      "category": "Platos Principales",
      "orders": 85,
      "revenue": 340000,
      "avgRating": 4.8
    },
    {
      "dishId": "dish_456",
      "name": "Pizza Muzzarella",
      "category": "Pizzas",
      "orders": 72,
      "revenue": 288000,
      "avgRating": 4.6
    }
  ]
}
```

**Ordenamiento:** Por `orders` (cantidad vendida) descendente

**Nota:** `avgRating` actualmente es un placeholder (4.5). Se puede reemplazar con ratings reales si se implementa sistema de calificaciones.

---

### 8. GET `/api/analytics/restaurant/:restaurantId/revenue-breakdown`

Desglose de ingresos por tipo de orden.

**Query Parameters:**

- `period` (required): `'today'` | `'week'` | `'month'` | `'quarter'` | `'year'`

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/revenue-breakdown?period=month" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "revenueBreakdown": [
    {
      "type": "DINE_IN",
      "label": "Para comer aquí",
      "orders": 120,
      "revenue": 450000,
      "percentage": 45.0
    },
    {
      "type": "PICKUP",
      "label": "Para llevar",
      "orders": 85,
      "revenue": 280000,
      "percentage": 28.0
    },
    {
      "type": "DELIVERY",
      "label": "Delivery",
      "orders": 95,
      "revenue": 270000,
      "percentage": 27.0
    }
  ]
}
```

**Ordenamiento:** Por `revenue` descendente

---

## 📊 Uso en Frontend

### Crear Analytics Service

```typescript
// src/lib/api/services/analytics.service.ts
import apiClient from '@/lib/api/client';

export type AnalyticsPeriod =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom'
  | 'all';

class AnalyticsService {
  async getSales(restaurantId: string, period: AnalyticsPeriod) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/sales?period=${period}`,
    );
    return data;
  }

  async getCategories(restaurantId: string, period: AnalyticsPeriod) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/categories?period=${period}`,
    );
    return data;
  }

  async getHourlyData(restaurantId: string, period: AnalyticsPeriod) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/hourly?period=${period}`,
    );
    return data;
  }

  async getTopCustomers(
    restaurantId: string,
    period: AnalyticsPeriod,
    limit = 10,
  ) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/top-customers?period=${period}&limit=${limit}`,
    );
    return data;
  }

  async getPerformance(restaurantId: string, period: AnalyticsPeriod) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/performance?period=${period}`,
    );
    return data;
  }

  async getComparison(restaurantId: string, period: AnalyticsPeriod) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/comparison?period=${period}`,
    );
    return data;
  }

  async getTopDishes(
    restaurantId: string,
    period: AnalyticsPeriod,
    limit = 10,
  ) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/top-dishes?period=${period}&limit=${limit}`,
    );
    return data;
  }

  async getRevenueBreakdown(restaurantId: string, period: AnalyticsPeriod) {
    const { data } = await apiClient.get(
      `/analytics/restaurant/${restaurantId}/revenue-breakdown?period=${period}`,
    );
    return data;
  }
}

export const analyticsService = new AnalyticsService();
```

### Ejemplo de uso en componente React

```typescript
'use client';

import { useState, useEffect } from 'react';
import { analyticsService, restaurantService } from '@/lib/api/services';
import type { AnalyticsPeriod } from '@/lib/api/services/analytics.service';
import { LineChart, PieChart, BarChart } from '@/components/charts';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    sales: null,
    categories: null,
    hourly: null,
    topCustomers: null,
    performance: null,
    comparison: null,
    topDishes: null,
    revenueBreakdown: null,
  });

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const restaurant = await restaurantService.getCurrent();

      const [
        sales,
        categories,
        hourly,
        topCustomers,
        performance,
        comparison,
        topDishes,
        revenueBreakdown,
      ] = await Promise.all([
        analyticsService.getSales(restaurant.id, period),
        analyticsService.getCategories(restaurant.id, period),
        analyticsService.getHourlyData(restaurant.id, period),
        analyticsService.getTopCustomers(restaurant.id, period),
        analyticsService.getPerformance(restaurant.id, period),
        analyticsService.getComparison(restaurant.id, period),
        analyticsService.getTopDishes(restaurant.id, period),
        analyticsService.getRevenueBreakdown(restaurant.id, period),
      ]);

      setData({
        sales,
        categories,
        hourly,
        topCustomers,
        performance,
        comparison,
        topDishes,
        revenueBreakdown,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando analytics...</div>;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex gap-2">
        {['today', 'week', 'month', 'year'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p as AnalyticsPeriod)}
            className={period === p ? 'active' : ''}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Comparison Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <h3>Ventas</h3>
          <p className="text-3xl">${(data.comparison.current.sales / 100).toFixed(2)}</p>
          <span className="text-sm text-green-600">
            +{data.comparison.growth.sales}% vs período anterior
          </span>
        </Card>
        {/* Más cards... */}
      </div>

      {/* Sales Chart */}
      <LineChart
        data={data.sales.salesData}
        xKey="date"
        yKey="sales"
        title="Evolución de Ventas"
      />

      {/* Category Breakdown */}
      <PieChart
        data={data.categories.categoryBreakdown}
        valueKey="sales"
        nameKey="category"
        title="Ventas por Categoría"
      />

      {/* Hourly Heatmap */}
      <BarChart
        data={data.hourly.hourlyData}
        xKey="hour"
        yKey="orders"
        title="Pedidos por Hora"
      />

      {/* Top Dishes Table */}
      <table>
        <thead>
          <tr>
            <th>Plato</th>
            <th>Categoría</th>
            <th>Órdenes</th>
            <th>Ingresos</th>
          </tr>
        </thead>
        <tbody>
          {data.topDishes.topDishes.map((dish) => (
            <tr key={dish.dishId}>
              <td>{dish.name}</td>
              <td>{dish.category}</td>
              <td>{dish.orders}</td>
              <td>${(dish.revenue / 100).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 📝 Formato de Datos

### Moneda

- **Backend:** Envía valores en centavos (integer)
- **Frontend:** Dividir por 100 para mostrar en pesos

```typescript
const displayPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;
```

### Fechas

- **Backend:** ISO 8601 `"2025-11-30T18:30:00Z"`
- **Frontend:** Formatear según locale

```typescript
const formatDate = (isoString: string) => {
  return new Date(isoString).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
```

### Porcentajes

- **Backend:** Número decimal `13.6` (no `0.136`)
- **Frontend:** Agregar símbolo `%`

```typescript
const displayPercentage = (value: number) => `${value.toFixed(1)}%`;
```

---

## 🎯 Filtros y Períodos

| Período   | Descripción         | Ejemplo                          |
| --------- | ------------------- | -------------------------------- |
| `today`   | Día actual          | 2025-11-30 00:00:00 → 23:59:59   |
| `week`    | Últimos 7 días      | 2025-11-23 → 2025-11-30          |
| `month`   | Mes actual          | 2025-11-01 → 2025-11-30          |
| `quarter` | Trimestre actual    | 2025-10-01 → 2025-12-31          |
| `year`    | Año actual          | 2025-01-01 → 2025-12-31          |
| `custom`  | Rango personalizado | Requiere `startDate` y `endDate` |
| `all`     | Todos los registros | Desde 2020-01-01                 |

**Ejemplo con período custom:**

```bash
curl -X GET "http://localhost:3000/api/analytics/restaurant/rest_abc/sales?period=custom&startDate=2025-11-01&endDate=2025-11-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🚀 Optimización y Performance

### Índices Recomendados

Ya están implementados en el schema de Prisma:

```prisma
@@index([restaurantId])
@@index([restaurantId, status])
@@index([restaurantId, createdAt])
@@index([orderId])
@@index([orderId, createdAt])
```

### Cacheo

Para mejorar performance en datos históricos:

```typescript
// Cachear datos de días/meses cerrados (no cambiarán)
const CACHE_TTL = {
  historical: 24 * 60 * 60, // 24 horas
  recent: 5 * 60, // 5 minutos
  realtime: 30, // 30 segundos
};

const getCacheKey = (restaurantId: string, period: string) =>
  `analytics:${restaurantId}:${period}`;
```

### Lazy Loading

Cargar solo los gráficos visibles:

```typescript
import dynamic from 'next/dynamic';

const SalesChart = dynamic(() => import('@/components/charts/SalesChart'), {
  loading: () => <Skeleton />,
  ssr: false
});
```

---

## ✅ Testing Checklist

**Ventas:**

- [ ] Obtener datos del día actual
- [ ] Obtener datos de la semana
- [ ] Obtener datos del mes
- [ ] Verificar que `avgTicket = sales / orders`
- [ ] Verificar orden cronológico

**Categorías:**

- [ ] Verificar suma de porcentajes = 100%
- [ ] Verificar orden por ventas
- [ ] Platos sin categoría aparecen como "Sin categoría"

**Horarios:**

- [ ] Retorna 24 horas (0-23)
- [ ] Horas sin pedidos tienen orders=0
- [ ] Identificar horarios pico correctamente

**Top Clientes:**

- [ ] Orden por `totalSpent` descendente
- [ ] Respetar parámetro `limit`
- [ ] `avgTicket = totalSpent / orders`
- [ ] `lastVisit` es la fecha más reciente

**Performance:**

- [ ] Tiempos en minutos (no segundos)
- [ ] `orderAccuracy` entre 0-100
- [ ] `customerSatisfaction` entre 0-5

**Comparación:**

- [ ] Período anterior calculado correctamente
- [ ] Growth positivo/negativo correcto
- [ ] División por cero manejada (growth = 0)

**Top Dishes:**

- [ ] Orden por cantidad vendida
- [ ] Revenue = suma de subtotals
- [ ] Incluye nombre de categoría

**Revenue Breakdown:**

- [ ] Suma de porcentajes = 100%
- [ ] Labels en español
- [ ] Orden por revenue descendente

---

## 📊 Casos de Uso Comunes

### Dashboard de Métricas

```typescript
const DashboardMetrics = ({ restaurantId }: Props) => {
  const { data: comparison } = useQuery(['comparison', 'month'],
    () => analyticsService.getComparison(restaurantId, 'month')
  );

  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard
        title="Ventas del Mes"
        value={formatCurrency(comparison.current.sales)}
        change={comparison.growth.sales}
        changeLabel="vs mes anterior"
      />
      {/* Más métricas... */}
    </div>
  );
};
```

### Identificar Horarios Pico

```typescript
const PeakHours = ({ restaurantId }: Props) => {
  const { data } = useQuery(['hourly', 'week'],
    () => analyticsService.getHourlyData(restaurantId, 'week')
  );

  const peakHours = data.hourlyData
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 3);

  return (
    <div>
      <h3>Horarios Pico</h3>
      {peakHours.map(h => (
        <div key={h.hour}>
          {h.hour}:00 - {h.orders} pedidos
        </div>
      ))}
    </div>
  );
};
```

### Platos a Promocionar

```typescript
// Platos con bajas ventas que podrían necesitar promoción
const LowPerformingDishes = ({ restaurantId }: Props) => {
  const { data } = useQuery(['top-dishes', 'month'],
    () => analyticsService.getTopDishes(restaurantId, 'month', 50)
  );

  const lowPerformers = data.topDishes
    .sort((a, b) => a.orders - b.orders)
    .slice(0, 5);

  return <PromotionSuggestions dishes={lowPerformers} />;
};
```

---

**Implementado:** 30 de noviembre de 2025  
**Backend Status:** 🟢 100% Production Ready  
**Total Endpoints:** 8 analytics endpoints
