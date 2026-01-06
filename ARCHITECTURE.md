# Arquitectura del Backend - Guía de Refactorización

## Resumen de Cambios

Esta refactorización implementa principios **DRY** (Don't Repeat Yourself) y **SOLID** para mejorar la mantenibilidad y escalabilidad del código.

---

## 📁 Nueva Estructura

```
src/
├── common/                              # 🆕 Módulo compartido global
│   ├── common.module.ts                 # Módulo @Global()
│   ├── index.ts                         # Exportaciones públicas
│   ├── guards/
│   │   └── restaurant-owner.guard.ts    # 🆕 Guard de ownership
│   ├── interceptors/
│   │   └── image-transform.interceptor.ts # 🆕 Transformación de URLs
│   ├── interfaces/
│   │   └── restaurant-owned.interface.ts
│   └── services/
│       ├── ownership.service.ts         # Verificación de permisos
│       └── image-processing.service.ts  # Procesamiento de imágenes
│
├── delivery/
│   ├── delivery.service.ts              # Servicio principal (delegaciones)
│   └── services/
│       ├── delivery-zones.service.ts    # 🆕 Gestión de zonas
│       └── delivery-drivers.service.ts  # 🆕 Gestión de conductores
│
├── storage/
│   ├── storage.module.ts
│   └── s3.service.ts                    # Operaciones S3 de bajo nivel
```

---

## 🔧 Servicios Centralizados

### 1. OwnershipService

Centraliza la verificación de permisos de usuario sobre restaurantes.

**Antes (código duplicado en 5+ archivos):**

```typescript
private async verifyRestaurantOwnership(restaurantId: string, userId: string) {
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: { users: { where: { id: userId } } },
  });
  if (!restaurant || restaurant.users.length === 0) {
    throw new ForbiddenException('...');
  }
}
```

**Después:**

```typescript
import { OwnershipService } from '../common/services/ownership.service';

constructor(private readonly ownership: OwnershipService) {}

await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);
// o
await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
```

**Métodos disponibles:**
| Método | Uso |
|--------|-----|
| `verifyUserOwnsRestaurant(restaurantId, userId)` | Verifica relación many-to-many (usuarios del restaurante) |
| `verifyUserBelongsToRestaurant(restaurantId, userId)` | Verifica relación directa (user.restaurantId) |
| `verifyUserRole(restaurantId, userId, roles[])` | Verifica rol específico |
| `getUserRestaurant(userId)` | Obtiene el restaurante del usuario |

---

### 2. ImageProcessingService

Centraliza el procesamiento de imágenes (base64, S3 keys, URLs).

**Antes (código duplicado en dishes.service.ts y categories.service.ts):**

```typescript
private async saveBase64Image(base64String: string, type: 'dish' | 'category') {
  // ~80 líneas de código duplicado
}
```

**Después:**

```typescript
import { ImageProcessingService } from '../common/services/image-processing.service';

constructor(private readonly imageProcessing: ImageProcessingService) {}

// Procesar cualquier formato de imagen
const key = await this.imageProcessing.processImage(dto.image, 'dish');

// Transformar key a URL para cliente
const url = this.imageProcessing.toClientUrl(dish.image);

// Transformar múltiples campos
const result = this.imageProcessing.transformImageFields(dish, ['image']);
```

**Métodos disponibles:**
| Método | Uso |
|--------|-----|
| `processImage(input, type)` | Procesa base64, S3 key, o URL proxy |
| `uploadBase64Image(base64, type)` | Sube imagen base64 a S3 |
| `deleteImage(urlOrKey)` | Elimina imagen de S3 |
| `toClientUrl(key)` | Convierte key a URL pública |
| `transformImageFields(obj, fields[])` | Transforma múltiples campos de imagen |
| `generatePresignedUpload(type, ext)` | Genera URL pre-firmada para upload |

---

## 📊 Impacto de la Refactorización

| Archivo                   | Antes       | Después     | Reducción |
| ------------------------- | ----------- | ----------- | --------- |
| restaurants.service.ts    | 1623 líneas | 1146 líneas | **-29%**  |
| restaurants.controller.ts | 652 líneas  | 560 líneas  | **-14%**  |
| delivery.service.ts       | 1130 líneas | 841 líneas  | **-26%**  |
| delivery.controller.ts    | 294 líneas  | 250 líneas  | **-15%**  |
| mercadopago.controller.ts | 151 líneas  | 129 líneas  | **-15%**  |
| dishes.service.ts         | 359 líneas  | 210 líneas  | **-42%**  |
| categories.service.ts     | 350 líneas  | 212 líneas  | **-39%**  |
| tables.service.ts         | 564 líneas  | 553 líneas  | **-2%**   |
| reservations.service.ts   | 220 líneas  | 185 líneas  | **-16%**  |
| orders.service.ts         | 695 líneas  | 685 líneas  | **-1%**   |

**Código eliminado duplicado:**

- `verifyRestaurantOwnership()`: 5 implementaciones → 1 servicio
- `saveBase64Image()`: 2 implementaciones → 1 servicio
- `checkOwnership()` en controllers: 30+ instancias → 1 decorador + 1 función
- `assertRestaurantAccess()` en mercadopago: Método privado → función compartida
- Transformaciones de imagen: Consolidadas en `transformImageFields()`
- Gestión de usuarios: Centralizada en `RestaurantUsersService`
- Branding y assets: Centralizado en `RestaurantBrandingService`
- Configuraciones: Centralizada en `RestaurantSettingsService`
- Zonas de delivery: Centralizada en `DeliveryZonesService`
- Conductores: Centralizada en `DeliveryDriversService`

---

## 🛡️ Decoradores de Autorización

### VerifyRestaurantAccess

Reemplaza verificaciones manuales de ownership en controllers.

**Antes (código repetido 15+ veces):**

```typescript
@Put(':id/hours')
async updateHours(
  @Param('id') id: string,
  @Body() dto: UpdateBusinessHoursDto,
  @CurrentUser() user: RequestUser,
) {
  if (user.restaurantId !== id) {
    throw new ForbiddenException('You can only update your own restaurant');
  }
  return this.service.updateHours(id, dto.hours);
}
```

**Después:**

```typescript
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';

@Put(':id/hours')
async updateHours(
  @VerifyRestaurantAccess('id') restaurantId: string,
  @Body() dto: UpdateBusinessHoursDto,
) {
  return this.service.updateHours(restaurantId, dto.hours);
}
```

### VerifyRestaurantRole

Para endpoints que requieren un rol específico.

```typescript
import { VerifyRestaurantRole } from '../common/decorators/verify-restaurant-access.decorator';

@Delete(':id/users/:userId')
async removeUser(
  @VerifyRestaurantRole({ paramName: 'id', role: 'OWNER' }) restaurantId: string,
  @Param('userId') userId: string,
) {
  // Solo OWNER puede ejecutar esta acción
  return this.service.removeUser(restaurantId, userId);
}
```

---

## 🚀 Cómo Usar los Servicios Compartidos

### En un nuevo servicio:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { ImageProcessingService } from '../common/services/image-processing.service';

@Injectable()
export class MiNuevoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  async create(restaurantId: string, userId: string, dto: CreateDto) {
    // Verificar permisos
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

    // Procesar imagen si viene en el DTO
    const imagePath = await this.imageProcessing.processImage(
      dto.image,
      'dish',
    );

    // Crear entidad
    const entity = await this.prisma.miModelo.create({
      data: { ...dto, image: imagePath },
    });

    // Retornar con URL de imagen transformada
    return this.imageProcessing.transformImageFields(entity, ['image']);
  }
}
```

### No necesitas importar CommonModule

El `CommonModule` está decorado con `@Global()`, por lo que los servicios están disponibles automáticamente en toda la aplicación.

---

## ✅ Principios Aplicados

### DRY (Don't Repeat Yourself)

- ✅ Verificación de ownership centralizada
- ✅ Procesamiento de imágenes unificado
- ✅ Transformaciones de URL consolidadas

### SOLID

- **S**ingle Responsibility: Cada servicio tiene una responsabilidad clara
- **O**pen/Closed: Servicios extensibles sin modificar código existente
- **L**iskov Substitution: Interfaces consistentes
- **I**nterface Segregation: Métodos pequeños y específicos
- **D**ependency Inversion: Inyección de dependencias vía constructor

---

## 🔜 Próximos Pasos Recomendados

1. ~~**Dividir `restaurants.service.ts`** (1623 líneas)~~ ✅ **COMPLETADO**:
   - `restaurant-branding.service.ts` - Assets y branding
   - `restaurant-settings.service.ts` - Horarios, pagos, delivery
   - `restaurant-users.service.ts` - Gestión de usuarios y roles

2. **Crear Guard de Ownership**:

   ```typescript
   @UseGuards(RestaurantOwnerGuard)
   @Get(':restaurantId/orders')
   async getOrders() { ... }
   ```

3. **Añadir Interceptor de Imágenes**:
   ```typescript
   @UseInterceptors(ImageUrlTransformInterceptor)
   @Get('dishes')
   async getDishes() { ... }
   ```

---

## 📦 Servicios de Restaurante (Refactorizados)

La división del monolítico `restaurants.service.ts` en servicios especializados:

```
src/restaurants/
├── restaurants.controller.ts     # Controlador principal
├── restaurants.service.ts        # Servicio CRUD principal
├── restaurants.module.ts         # Módulo con todos los providers
├── dto/
│   └── restaurant-settings.dto.ts
└── services/
    ├── restaurant-branding.service.ts   # 🆕 Assets y branding
    ├── restaurant-settings.service.ts   # 🆕 Configuraciones
    └── restaurant-users.service.ts      # 🆕 Usuarios y roles
```

### RestaurantBrandingService

Gestiona assets visuales y configuración de marca.

| Método                               | Descripción                        |
| ------------------------------------ | ---------------------------------- |
| `updateBranding(id, dto)`            | Actualiza colores, layout, logo    |
| `deleteAsset(id, type)`              | Elimina asset (banner, logo, etc.) |
| `presignAssetUpload(id, type, opts)` | Genera URL pre-firmada para upload |
| `saveUploadedAsset(id, file, type)`  | Guarda archivo subido              |
| `saveDataUrl(id, dataUrl, type)`     | Guarda imagen base64               |

### RestaurantSettingsService

Gestiona configuraciones operativas.

| Método                             | Descripción                   |
| ---------------------------------- | ----------------------------- |
| `updateHours(id, hours)`           | Actualiza horarios de negocio |
| `updatePaymentMethods(id, config)` | Configura métodos de pago     |
| `updateDeliveryZones(id, config)`  | Actualiza zonas de delivery   |
| `getDeliveryZones(id)`             | Obtiene zonas de delivery     |
| `logVisit(id, meta)`               | Registra visita (analytics)   |

### RestaurantUsersService

Gestiona usuarios y roles del restaurante.

| Método                                                      | Descripción                     |
| ----------------------------------------------------------- | ------------------------------- |
| `getRoles(restaurantId)`                                    | Obtiene roles del restaurante   |
| `getRestaurantUsers(restaurantId)`                          | Lista usuarios del restaurante  |
| `inviteUser(restaurantId, dto)`                             | Invita nuevo usuario            |
| `updateUserRole(restaurantId, userId, dto)`                 | Cambia rol de usuario           |
| `removeUser(restaurantId, userId)`                          | Elimina usuario del restaurante |
| `associateUserWithRestaurant(userId, restaurantId, roleId)` | Asocia usuario existente        |

---

## 🛡️ Guards e Interceptors

### RestaurantOwnerGuard

Guard que verifica que el usuario pertenece al restaurante especificado en la ruta.

**Uso:**

```typescript
import { RestaurantOwnerGuard, RestaurantIdParam } from '../common';

@Controller('restaurants/:restaurantId/orders')
@UseGuards(JwtAuthGuard, RestaurantOwnerGuard)
@RestaurantIdParam('restaurantId') // opcional, default es 'id'
export class OrdersController {
  @Get()
  async getOrders(@Param('restaurantId') restaurantId: string) {
    // El guard ya verificó que el usuario tiene acceso
  }
}
```

### ImageTransformInterceptor

Interceptor que transforma automáticamente S3 keys a URLs públicas en las respuestas.

**Uso:**

```typescript
import { ImageTransformInterceptor, TransformImageFields } from '../common';

@Controller('dishes')
@UseInterceptors(ImageTransformInterceptor)
export class DishesController {
  @Get()
  @TransformImageFields('image', 'thumbnail')
  async getDishes() {
    // Las URLs de imagen se transforman automáticamente
  }
}
```

---

## 📦 Servicios de Delivery (Refactorizados)

La división del `delivery.service.ts` en servicios especializados:

```
src/delivery/
├── delivery.controller.ts
├── delivery.service.ts          # Servicio principal con delegaciones
├── delivery.module.ts
├── dto/
│   └── delivery.dto.ts
└── services/
    ├── delivery-zones.service.ts   # 🆕 Gestión de zonas
    └── delivery-drivers.service.ts # 🆕 Gestión de conductores
```

### DeliveryZonesService

Gestiona las zonas de delivery del restaurante.

| Método                              | Descripción              |
| ----------------------------------- | ------------------------ |
| `getZones(restaurantId)`            | Lista zonas con stats    |
| `createZone(restaurantId, dto)`     | Crea nueva zona          |
| `updateZone(restaurantId, id, dto)` | Actualiza zona existente |
| `deleteZone(restaurantId, id)`      | Elimina zona             |

### DeliveryDriversService

Gestiona los conductores/repartidores.

| Método                                        | Descripción                 |
| --------------------------------------------- | --------------------------- |
| `getDrivers(restaurantId, filters)`           | Lista conductores con stats |
| `createDriver(restaurantId, dto)`             | Crea nuevo conductor        |
| `updateDriver(restaurantId, id, dto)`         | Actualiza conductor         |
| `deleteDriver(restaurantId, id)`              | Elimina conductor           |
| `getDriverStats(restaurantId, id, filters)`   | Estadísticas del conductor  |
| `updateDriverLocation(restaurantId, id, dto)` | Actualiza ubicación GPS     |
| `getDriverLocation(restaurantId, id)`         | Obtiene última ubicación    |
