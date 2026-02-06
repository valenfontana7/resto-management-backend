# Configuración de Navigation (Nav) en Branding

## 📋 Overview

La propiedad `nav` en el branding permite personalizar la apariencia y comportamiento del header/navegación en el frontend público del restaurante.

## 🔧 Estructura de Datos

### TypeScript Interface

```typescript
interface NavConfig {
  logoSize?: 'sm' | 'md' | 'lg';
  showOpenStatus?: boolean;
  showContactButton?: boolean;
  cuisineTypesColor?: string; // Hex color (#RRGGBB)
}
```

### Ubicación en Branding

```typescript
{
  branding: {
    sections: {
      nav: {
        logoSize: 'md',
        showOpenStatus: true,
        showContactButton: true,
        cuisineTypesColor: '#6b7280'
      }
    }
  }
}
```

## 🚀 API Endpoints

### Actualizar Navigation Config

**Endpoint:** `PUT /api/restaurants/:id/branding`

**Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "sections": {
    "nav": {
      "logoSize": "md",
      "showOpenStatus": true,
      "showContactButton": true,
      "cuisineTypesColor": "#6b7280"
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "branding": {
    "sections": {
      "nav": {
        "logoSize": "md",
        "showOpenStatus": true,
        "showContactButton": true,
        "cuisineTypesColor": "#6b7280"
      }
    }
  }
}
```

## 📝 Propiedades

### `logoSize`

- **Tipo:** `'sm' | 'md' | 'lg'`
- **Descripción:** Tamaño del logo en el header
- **Opcional:** Sí
- **Default:** `'md'` (definido en frontend)

### `showOpenStatus`

- **Tipo:** `boolean`
- **Descripción:** Muestra el indicador de "Abierto/Cerrado" en el header
- **Opcional:** Sí
- **Default:** `true` (definido en frontend)

### `showContactButton`

- **Tipo:** `boolean`
- **Descripción:** Muestra el botón de contacto en el header
- **Opcional:** Sí
- **Default:** `true` (definido en frontend)

### `cuisineTypesColor`

- **Tipo:** `string` (hex color)
- **Descripción:** Color del texto que muestra los tipos de cocina del restaurante
- **Validación:** Debe ser un color hexadecimal válido (`#RRGGBB`)
- **Opcional:** Sí
- **Default:** `undefined` (frontend usa color por defecto basado en tema)
- **Ejemplo:** `"#6b7280"`, `"#ff0000"`, `"#34d399"`

## 🎨 Ejemplos de Uso

### Ejemplo 1: Actualizar solo el color de tipos de cocina

```bash
curl -X PUT "http://localhost:4000/api/restaurants/clx123abc/branding" \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "sections": {
      "nav": {
        "cuisineTypesColor": "#8b5cf6"
      }
    }
  }'
```

### Ejemplo 2: Actualizar múltiples propiedades del nav

```bash
curl -X PUT "http://localhost:4000/api/restaurants/clx123abc/branding" \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "sections": {
      "nav": {
        "logoSize": "lg",
        "showOpenStatus": false,
        "cuisineTypesColor": "#ec4899"
      }
    }
  }'
```

### Ejemplo 3: Actualizar nav junto con otros elementos de branding

```bash
curl -X PUT "http://localhost:4000/api/restaurants/clx123abc/branding" \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "colors": {
      "primary": "#3b82f6",
      "secondary": "#8b5cf6"
    },
    "sections": {
      "nav": {
        "cuisineTypesColor": "#6b7280",
        "logoSize": "md"
      }
    },
    "hero": {
      "minHeight": "lg",
      "textAlign": "center"
    }
  }'
```

## ✅ Validaciones

### Color Hexadecimal

El backend valida que `cuisineTypesColor` sea un color hexadecimal válido:

✅ **Válidos:**

- `"#ff0000"` (rojo)
- `"#00FF00"` (verde - case insensitive)
- `"#3B82F6"` (azul)

❌ **Inválidos:**

- `"ff0000"` (falta #)
- `"#fff"` (formato corto no soportado)
- `"rgb(255,0,0)"` (solo hex)
- `"red"` (nombre de color no soportado)

### Ejemplo de Error de Validación

```json
{
  "statusCode": 400,
  "message": [
    "nav.cuisineTypesColor must match /^#[0-9A-Fa-f]{6}$/ regular expression"
  ],
  "error": "Bad Request"
}
```

## 🔄 Actualizaciones Parciales

El endpoint soporta actualizaciones parciales. Solo las propiedades enviadas se actualizarán:

```json
// Solo actualizar el color
{
  "sections": {
    "nav": {
      "cuisineTypesColor": "#10b981"
    }
  }
}

// Solo actualizar tamaño de logo
{
  "sections": {
    "nav": {
      "logoSize": "lg"
    }
  }
}
```

Las propiedades no enviadas permanecerán sin cambios.

## 🗄️ Base de Datos

Los datos se almacenan en el campo JSON `branding` de la tabla `Restaurant`:

```sql
-- Estructura almacenada en PostgreSQL
{
  "colors": {...},
  "layout": {...},
  "sections": {
    "nav": {
      "logoSize": "md",
      "showOpenStatus": true,
      "showContactButton": true,
      "cuisineTypesColor": "#6b7280"
    }
  },
  ...
}
```

## 🔍 Consultar Branding Actual

**Endpoint:** `GET /api/restaurants/:id`

**Response:** Incluye el branding completo con la configuración de nav

```json
{
  "id": "clx123abc",
  "name": "Mi Restaurante",
  "branding": {
    "sections": {
      "nav": {
        "logoSize": "md",
        "cuisineTypesColor": "#6b7280"
      }
    }
  }
}
```

## 📚 Notas Adicionales

1. **Backward Compatibility:** La propiedad `nav` es completamente opcional. Los restaurantes existentes sin esta configuración seguirán funcionando con los valores por defecto del frontend.

2. **Merge Behavior:** Al actualizar, solo las propiedades enviadas se modifican. Las propiedades existentes no enviadas se mantienen intactas.

3. **Frontend Fallback:** Si `cuisineTypesColor` no está definido o es `null`, el frontend usa automáticamente un color basado en el tema del restaurante.

4. **Permisos:** Se requiere autenticación y permisos de gestión sobre el restaurante (OWNER, ADMIN, MANAGER).
