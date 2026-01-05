# Mobile Menu Configuration API

## Overview

El backend soporta configuración dinámica del menú móvil (hamburguesa) como parte del objeto `branding` del restaurante.

## Estructura de Datos

### Schema JSON (embebido en `branding`)

```typescript
branding: {
  // ... otros campos de branding ...
  mobileMenu?: {
    backgroundColor?: string         // Hex color (e.g., "#FF5722")
    textColor?: string              // Hex color (e.g., "#FFFFFF")
    items?: Array<{
      label: string                 // Texto del elemento (e.g., "Inicio")
      href: string                  // URL relativa o absoluta (e.g., "/menu")
      icon?: string                 // Nombre del icono lucide (e.g., "Home", "Utensils")
      enabled?: boolean             // Si mostrar el elemento (default: true)
    }>
  }
}
```

## Endpoints

### 1. GET `/api/restaurants/slug/:slug`

**Endpoint público** que retorna información del restaurante incluyendo `branding.mobileMenu`.

**Ejemplo de Respuesta:**

```json
{
  "restaurant": {
    "id": "cm123abc",
    "slug": "mi-restaurante",
    "name": "Mi Restaurante",
    "branding": {
      "colors": {
        "primary": "#4f46e5"
      },
      "mobileMenu": {
        "backgroundColor": "#FF5722",
        "textColor": "#FFFFFF",
        "items": [
          { "label": "Inicio", "href": "/", "icon": "Home", "enabled": true },
          {
            "label": "Menú",
            "href": "/menu",
            "icon": "Utensils",
            "enabled": true
          },
          {
            "label": "Reservas",
            "href": "/reservas",
            "icon": "Calendar",
            "enabled": true
          }
        ]
      }
    }
  }
}
```

### 2. PATCH `/api/restaurants/:id`

**Endpoint protegido** (requiere autenticación) para actualizar la configuración del restaurante.

**Request Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body (actualización completa):**

```json
{
  "branding": {
    "mobileMenu": {
      "backgroundColor": "#1f2937",
      "textColor": "#FFFFFF",
      "items": [
        { "label": "Inicio", "href": "/", "icon": "Home", "enabled": true },
        {
          "label": "Menú",
          "href": "/menu",
          "icon": "Utensils",
          "enabled": true
        },
        {
          "label": "Carrito",
          "href": "/cart",
          "icon": "ShoppingCart",
          "enabled": true
        },
        {
          "label": "Reservar Mesa",
          "href": "/reservas",
          "icon": "Calendar",
          "enabled": true
        },
        {
          "label": "Contacto",
          "href": "tel:+541112345678",
          "icon": "Phone",
          "enabled": true
        }
      ]
    }
  }
}
```

**Request Body (actualización parcial - solo backgroundColor):**

```json
{
  "branding": {
    "mobileMenu": {
      "backgroundColor": "#4f46e5"
    }
  }
}
```

**Nota:** Los campos no enviados se mantienen con sus valores actuales gracias al merge profundo implementado en el servicio.

**Response:** 200 OK

```json
{
  "restaurant": {
    "id": "cm123abc",
    "branding": {
      "mobileMenu": {
        "backgroundColor": "#4f46e5",
        "textColor": "#FFFFFF",
        "items": [...]
      }
    },
    "updatedAt": "2026-01-01T12:34:56.789Z"
  }
}
```

## Validaciones

### MobileMenuConfigDto

| Campo             | Tipo             | Requerido | Validación                              |
| ----------------- | ---------------- | --------- | --------------------------------------- |
| `backgroundColor` | string           | No        | Regex: `^#[0-9A-Fa-f]{6}$` (hex válido) |
| `textColor`       | string           | No        | Regex: `^#[0-9A-Fa-f]{6}$` (hex válido) |
| `items`           | MobileMenuItem[] | No        | Array de objetos válidos                |

### MobileMenuItemDto

| Campo     | Tipo    | Requerido | Validación                                            |
| --------- | ------- | --------- | ----------------------------------------------------- |
| `label`   | string  | **Sí**    | No vacío                                              |
| `href`    | string  | **Sí**    | Debe empezar con `/`, `http://`, `https://`, o `tel:` |
| `icon`    | string  | No        | Cualquier string (validado en frontend)               |
| `enabled` | boolean | No        | Default: `true`                                       |

### Ejemplos de hrefs válidos

```typescript
// Rutas relativas
'/menu';
'/';
'/reservas';

// URLs absolutas
'https://external-site.com/delivery';
'http://ejemplo.com';

// Enlaces telefónicos
'tel:+541112345678';
'tel:+34912345678';
```

### Ejemplos de hrefs inválidos

```typescript
'menu'; // No empieza con /
'www.example.com'; // No incluye http/https
'#section'; // Anchor no soportado
'javascript:alert()'; // No permitido por seguridad
```

## Iconos Soportados (Frontend)

El frontend usa **lucide-react**. Iconos comunes:

- `Home`, `Utensils`, `ShoppingCart`, `Calendar`, `Phone`
- `MapPin`, `User`, `Settings`, `Heart`, `Star`
- `Search`, `Bell`, `Clock`, `TrendingUp`, `Eye`

Si se usa un nombre no soportado, el frontend cae a `Home` por defecto.

## Valores por Defecto

Si `branding.mobileMenu` no está configurado, el frontend usa estos defaults:

```typescript
{
  backgroundColor: branding.colors.primary || "#4f46e5",
  textColor: "#FFFFFF", // o color calculado automáticamente para contraste
  items: [
    { label: 'Inicio', href: '/{slug}', icon: 'Home', enabled: true },
    { label: 'Menú', href: '/{slug}/menu', icon: 'Utensils', enabled: true },
    { label: 'Carrito', href: '/{slug}/cart', icon: 'ShoppingCart', enabled: true },
    { label: 'Reservar Mesa', href: '/{slug}/reservas', icon: 'Calendar', enabled: restaurant.features?.reservations },
    { label: 'Contacto', href: 'tel:+{phone}', icon: 'Phone', enabled: !!restaurant.phone }
  ]
}
```

## Compatibilidad

### Restaurantes Existentes

- ✅ **Sin impacto**: Si no tienen `mobileMenu` configurado, el frontend usa defaults
- ✅ **Migración opcional**: Los administradores pueden configurarlo cuando lo deseen
- ✅ **Sin pérdida de datos**: El merge profundo preserva otros campos de branding

### Database Schema

El campo `branding` ya existe como tipo `Json` en Prisma:

```prisma
model Restaurant {
  // ...
  branding Json?
  // ...
}
```

**No se requiere migración de base de datos**. El campo JSON ya soporta cualquier estructura.

## Ejemplo Completo de Uso

### Paso 1: Obtener configuración actual

```bash
curl -X GET 'http://localhost:4000/api/restaurants/slug/mi-restaurante'
```

### Paso 2: Actualizar menú móvil

```bash
curl -X PATCH 'http://localhost:4000/api/restaurants/cm123abc' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'Content-Type: application/json' \
  -d '{
    "branding": {
      "mobileMenu": {
        "backgroundColor": "#1f2937",
        "textColor": "#f3f4f6",
        "items": [
          { "label": "Home", "href": "/", "icon": "Home" },
          { "label": "Order Now", "href": "/menu", "icon": "Utensils" },
          { "label": "Call Us", "href": "tel:+541112345678", "icon": "Phone" }
        ]
      }
    }
  }'
```

### Paso 3: Verificar cambios

```bash
curl -X GET 'http://localhost:4000/api/restaurants/slug/mi-restaurante'
```

## Troubleshooting

### Error: "Invalid hex color format"

**Causa:** `backgroundColor` o `textColor` no tiene formato hex válido

**Solución:** Usar formato `#RRGGBB` (6 dígitos hex)

```json
// ❌ Incorrecto
"backgroundColor": "#FFF"
"backgroundColor": "red"

// ✅ Correcto
"backgroundColor": "#FFFFFF"
"backgroundColor": "#FF5722"
```

### Error: "href must start with /, http://, https://, or tel:"

**Causa:** El `href` no tiene un formato válido

**Solución:** Agregar prefijo correcto

```json
// ❌ Incorrecto
"href": "menu"

// ✅ Correcto
"href": "/menu"
```

### Items no aparecen en el frontend

**Causa:** `enabled: false` o validación falló

**Solución:**

1. Verificar que `enabled: true` (o remover el campo, default es `true`)
2. Revisar logs del backend para errores de validación
3. Verificar que los campos requeridos (`label`, `href`) estén presentes

## Logs y Debugging

El servicio imprime logs útiles durante la actualización:

```
📝 Updating restaurant with data: { branding: { mobileMenu: {...} } }
🔁 raw updated from prisma (post-update): { mobileMenu: {...} }
✅ Restaurant updated: { id: "...", hasBranding: true }
```

Buscar estos logs en la consola del servidor para debuggear problemas.

## Referencias

- **DTOs:** `src/restaurants/dto/update-restaurant-settings.dto.ts`
- **Service:** `src/restaurants/restaurants.service.ts` (método `update()`)
- **Controller:** `src/restaurants/restaurants.controller.ts`
- **Schema:** `prisma/schema.prisma`
