# Sistema de Gestión de Planes de Suscripción - Implementación Completada

## ✅ Cambios Realizados

### 1. **Schema de Base de Datos** ([prisma/schema.prisma](prisma/schema.prisma))

Se agregaron dos nuevos modelos:

- **`SubscriptionPlan`**: Planes de suscripción configurables
  - Campos: id, displayName, description, price, interval, trialDays, color, order, isActive, isDefault
  - Relaciones: restrictions, subscriptions

- **`PlanRestriction`**: Restricciones y límites por plan
  - Campos: key, type, value, displayName, description, category
  - Tipos: limit, boolean, text
  - Categorías: limits, features, integrations, support

- **Actualización del modelo `Subscription`**:
  - Agregado: `planId` (relación con SubscriptionPlan)
  - Mantenido: `planType` (por compatibilidad con código existente)

### 2. **Seed de Datos** ([prisma/seed.ts](prisma/seed.ts))

Se crearon 3 planes por defecto:

#### **STARTER** (Gratis)

- Precio: $0
- Trial: 30 días
- Límites:
  - 50 productos
  - 3 usuarios
  - 10 mesas
  - 100 órdenes/mes
- Features: QR menus, pedidos online, MercadoPago
- Soporte: Email

#### **PROFESSIONAL** ($29,999/mes)

- Trial: 14 días
- Límites:
  - 200 productos
  - 10 usuarios
  - 50 mesas
  - 1,000 órdenes/mes
- Features: Todo STARTER + reservaciones, delivery, analytics, branding, WhatsApp
- Soporte: Prioritario

#### **ENTERPRISE** ($79,999/mes)

- Trial: 7 días
- Límites: Ilimitados (9,999)
- Features: Todo + multi-ubicación, API access, integraciones custom
- Soporte: Dedicado 24/7

### 3. **Módulo de Planes** (`src/subscriptions/plans/`)

#### DTOs Creados:

- `create-plan.dto.ts` - Crear plan con restricciones
- `update-plan.dto.ts` - Actualizar plan
- `create-restriction.dto.ts` - Crear restricción
- `update-restriction.dto.ts` - Actualizar restricción

#### Servicio: [plans.service.ts](src/subscriptions/plans/plans.service.ts)

**Métodos de Planes:**

- `findAll()` - Todos los planes (admin)
- `findActive()` - Solo planes activos (público)
- `findOne(id)` - Plan específico
- `create(dto)` - Crear plan
- `update(id, dto)` - Actualizar plan
- `remove(id)` - Eliminar plan (valida suscripciones activas)

**Métodos de Restricciones:**

- `findRestrictions(planId)` - Listar restricciones
- `findRestriction(planId, restrictionId)` - Obtener restricción
- `createRestriction(planId, dto)` - Crear restricción
- `updateRestriction(planId, restrictionId, dto)` - Actualizar
- `removeRestriction(planId, restrictionId)` - Eliminar

**Utilidades:**

- `getRestrictionsByCategory(planId)` - Restricciones agrupadas
- `hasFeature(planId, key)` - Verificar característica
- `getLimit(planId, key)` - Obtener límite

#### Controlador: [plans.controller.ts](src/subscriptions/plans/plans.controller.ts)

**Endpoints Públicos** en `/api/plans`:

```
GET /api/plans           # Listar planes activos (público)
GET /api/plans/:id       # Detalles de un plan (público)
```

**Endpoints de Admin** en `/api/master/plans`:

```
GET    /api/master/plans                          # Todos los planes
GET    /api/master/plans/active                   # Planes activos
GET    /api/master/plans/:id                      # Plan específico
POST   /api/master/plans                          # Crear plan
PATCH  /api/master/plans/:id                      # Actualizar plan
DELETE /api/master/plans/:id                      # Eliminar plan

GET    /api/master/plans/:id/restrictions         # Listar restricciones
GET    /api/master/plans/:id/restrictions/grouped # Agrupadas por categoría
POST   /api/master/plans/:id/restrictions         # Crear restricción
PATCH  /api/master/plans/:id/restrictions/:rid    # Actualizar restricción
DELETE /api/master/plans/:id/restrictions/:rid    # Eliminar restricción
```

### 4. **Actualización de Suscripciones**

#### [subscriptions.service.ts](src/subscriptions/subscriptions.service.ts)

**Integración con PlansService:**

- ✅ Inyecta `PlansService` en constructor
- ✅ Obtiene precios dinámicamente en lugar de usar constantes hardcodeadas
- ✅ Métodos actualizados:
  - `getSubscriptionSummary()` - Obtiene precio del plan actual
  - `createCheckout()` - Usa precio dinámico del plan
  - `getSubscription()` - Incluye `plan` con `restrictions`

**Método Nuevo:**

- `upgradePlan(restaurantId, newPlanId)` - Cambiar plan
  - Valida que el plan exista y esté activo
  - Actualiza planId y planType
  - Retorna suscripción con plan y restricciones

#### [subscriptions-tasks.service.ts](src/subscriptions/subscriptions-tasks.service.ts)

**Integración con PlansService:**

- ✅ Inyecta `PlansService` en constructor
- ✅ Métodos actualizados para usar precios dinámicos:
  - `checkExpiredTrials()` - Obtiene precio del plan antes de cobrar
  - `sendTrialReminders()` - Usa precio dinámico en notificaciones
  - `processSubscriptionRenewals()` - Consulta precio del plan para renovaciones

#### [subscriptions.controller.ts](src/subscriptions/subscriptions.controller.ts)

**Endpoint Nuevo:**

```
PATCH /api/restaurants/:restaurantId/subscription/upgrade
Body: { "newPlanId": "PROFESSIONAL" }
```

### 5. **Integración en el Módulo Principal**

[subscriptions.module.ts](src/subscriptions/subscriptions.module.ts) - Importa `PlansModule`

## 📊 Estructura de Datos

### Ejemplo de Plan con Restricciones:

```json
{
  "id": "PROFESSIONAL",
  "displayName": "Professional",
  "description": "Para restaurantes establecidos que buscan crecer",
  "price": 29999,
  "interval": "monthly",
  "trialDays": 14,
  "color": "from-purple-400 to-purple-600",
  "order": 2,
  "isActive": true,
  "isDefault": false,
  "restrictions": [
    {
      "id": "cuid123",
      "planId": "PROFESSIONAL",
      "key": "products",
      "type": "limit",
      "value": "200",
      "displayName": "Productos",
      "description": "Cantidad máxima de productos en el menú",
      "category": "limits"
    },
    {
      "key": "reservations",
      "type": "boolean",
      "value": "true",
      "displayName": "Reservaciones",
      "category": "features"
    }
  ]
}
```

## 🚀 Uso

### Para Usuarios Públicos (Ver Planes Disponibles):

```typescript
// Ver todos los planes disponibles
GET / api / plans;

// Ver detalles de un plan específico
GET / api / plans / PROFESSIONAL;
```

### Para Administradores (Gestión de Planes):

```typescript
// Crear plan personalizado
POST /api/master/plans
{
  "id": "CUSTOM_PREMIUM",
  "displayName": "Premium Custom",
  "description": "Plan personalizado",
  "price": 49999,
  "interval": "monthly",
  "trialDays": 7,
  "color": "from-green-400 to-green-600",
  "order": 4,
  "restrictions": [
    {
      "key": "products",
      "type": "limit",
      "value": "500",
      "displayName": "Productos",
      "category": "limits"
    }
  ]
}

// Actualizar restricción
PATCH /api/master/plans/STARTER/restrictions/:rid
{
  "value": "100"
}
```

### Para Restaurantes (Gestión de Suscripción):

```typescript
// Ver suscripción actual con plan
GET /api/restaurants/:id/subscription

// Cambiar a plan Professional
PATCH /api/restaurants/:id/subscription/upgrade
{
  "newPlanId": "PROFESSIONAL"
}

// Verificar límite (desde el backend)
const plan = await plansService.findOne(subscription.planId);
const productLimit = await plansService.getLimit(plan.id, 'products');

// Verificar feature (desde el backend)
const hasDelivery = await plansService.hasFeature(plan.id, 'delivery');
```

## 🔄 Migración de Datos Hardcodeados a Dinámicos

### Cambios Realizados:

1. **SubscriptionsService** - Eliminado uso de `PLAN_PRICES` constante:
   - ✅ `getSubscriptionSummary()` - Ahora consulta precio del plan actual
   - ✅ `createCheckout()` - Obtiene precio dinámicamente antes de crear checkout

2. **SubscriptionTasksService** - Actualizado para usar precios dinámicos:
   - ✅ `checkExpiredTrials()` - Consulta precio antes de cobrar trial expirado
   - ✅ `sendTrialReminders()` - Obtiene precio para emails de recordatorio
   - ✅ `processSubscriptionRenewals()` - Usa precio dinámico para renovaciones

3. **Endpoints Públicos**:
   - ✅ `GET /api/plans` - Lista planes activos con restricciones
   - ✅ `GET /api/plans/:id` - Detalles de plan específico

### Constantes Mantenidas:

- `PLAN_NAMES` - Mapeo de nombres de planes (compatibilidad)
- `TRIAL_DAYS` - Días de trial por plan (deprecado, ahora en BD)

### Beneficios:

- ✅ **Flexibilidad**: Cambiar precios sin redesplegar código
- ✅ **Escalabilidad**: Crear planes personalizados ilimitados
- ✅ **Auditabilidad**: Todos los cambios quedan registrados
- ✅ **Multi-moneda**: Futuro soporte para diferentes monedas

## 🔧 Próximos Pasos Recomendados

1. **Guards de Autorización**: Proteger endpoints de `/api/master/plans` con rol SUPER_ADMIN
2. **Validación de Límites**: Implementar middleware para verificar límites en tiempo real
3. **Migraciones de Planes**: Script para migrar suscripciones existentes a usar planId
4. **Interfaz de Admin**: Frontend para gestión visual de planes
5. **Webhooks de MercadoPago**: Actualizar para manejar cambios de plan
6. **Métricas**: Dashboard para comparar uso vs límites del plan

## 📝 Notas

- ✅ Todos los planes se sembraron en la base de datos
- ✅ Sistema retrocompatible (mantiene `planType` enum)
- ✅ Validaciones de negocio implementadas
- ✅ Relaciones en cascada configuradas
- ✅ **Endpoints públicos y privados separados**
- ✅ **Precios dinámicos implementados en todo el sistema**
- ✅ **Servicios de suscripciones y tareas actualizados**
- ⚠️ Falta protección de endpoints de admin con guards de autenticación
- ⚠️ Considerar deprecar constantes `PLAN_NAMES` y `TRIAL_DAYS` en futuras versiones
