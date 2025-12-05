# 🔧 Settings & Configuration API

**Versión:** 1.0  
**Base URL:** `/api/restaurants/:restaurantId`  
**Autenticación:** Bearer Token (JWT)

## 📋 Tabla de Contenidos

1. [Información General](#información-general)
2. [Horarios de Atención](#horarios-de-atención)
3. [Branding y Apariencia](#branding-y-apariencia)
4. [Métodos de Pago](#métodos-de-pago)
5. [Zonas de Delivery](#zonas-de-delivery)
6. [Gestión de Usuarios](#gestión-de-usuarios)
7. [Roles y Permisos](#roles-y-permisos)
8. [Códigos de Error](#códigos-de-error)
9. [Ejemplos de Integración](#ejemplos-de-integración)

---

## 🏢 Información General

### PATCH `/api/restaurants/:id`

Actualiza la información general del restaurante.

**Headers:**

```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "businessInfo": {
    "name": "La Parrilla Argentina",
    "description": "Restaurante especializado en parrilla argentina con cortes premium",
    "logo": "https://example.com/logo.png",
    "coverImage": "https://example.com/cover.jpg"
  },
  "contact": {
    "address": "Av. Libertador 1234",
    "city": "Buenos Aires",
    "country": "Argentina",
    "postalCode": "C1425",
    "phone": "+5491123456789",
    "email": "info@laparrilla.com",
    "website": "https://laparrilla.com"
  },
  "taxId": "20-12345678-9"
}
```

**Validation Rules:**

- `name`: 2-100 caracteres
- `description`: Máximo 500 caracteres
- `logo`, `coverImage`, `website`: URLs válidas
- `email`: Formato de email válido
- `phone`: Formato internacional recomendado
- `taxId`: CUIT/CUIL formato XX-XXXXXXXX-X (Argentina)

**Response 200:**

```json
{
  "id": "rest_abc123",
  "name": "La Parrilla Argentina",
  "description": "Restaurante especializado...",
  "logo": "https://example.com/logo.png",
  "coverImage": "https://example.com/cover.jpg",
  "email": "info@laparrilla.com",
  "phone": "+5491123456789",
  "address": "Av. Libertador 1234",
  "city": "Buenos Aires",
  "country": "Argentina",
  "postalCode": "C1425",
  "website": "https://laparrilla.com",
  "updatedAt": "2025-11-26T20:30:00Z"
}
```

**Error 400:** Validación fallida

```json
{
  "statusCode": 400,
  "message": ["Invalid CUIT/CUIL format. Expected: XX-XXXXXXXX-X"],
  "error": "Bad Request"
}
```

**Error 403:** No tienes permiso

```json
{
  "statusCode": 403,
  "message": "You can only update your own restaurant",
  "error": "Forbidden"
}
```

---

## 🕒 Horarios de Atención

### PUT `/api/restaurants/:id/hours`

Configura los horarios de apertura del restaurante. Reemplaza todos los horarios existentes.

**Request Body:**

```json
{
  "hours": [
    {
      "dayOfWeek": 0,
      "isOpen": false,
      "openTime": null,
      "closeTime": null
    },
    {
      "dayOfWeek": 1,
      "isOpen": true,
      "openTime": "11:00",
      "closeTime": "23:30"
    },
    {
      "dayOfWeek": 2,
      "isOpen": true,
      "openTime": "11:00",
      "closeTime": "23:30"
    },
    {
      "dayOfWeek": 6,
      "isOpen": true,
      "openTime": "12:00",
      "closeTime": "01:00"
    }
  ]
}
```

**Validation Rules:**

- `dayOfWeek`: 0-6 (0=Domingo, 1=Lunes, ..., 6=Sábado)
- `isOpen`: Boolean
- `openTime`, `closeTime`: Formato HH:mm (24 horas)
- Si `isOpen` es `false`, openTime y closeTime deben ser `null`

**Response 200:**

```json
{
  "success": true,
  "hours": [
    {
      "id": "hour_1",
      "dayOfWeek": 0,
      "isOpen": false,
      "openTime": null,
      "closeTime": null
    },
    {
      "id": "hour_2",
      "dayOfWeek": 1,
      "isOpen": true,
      "openTime": "11:00",
      "closeTime": "23:30"
    }
  ],
  "updatedAt": "2025-11-26T20:30:00Z"
}
```

---

## 🎨 Branding y Apariencia

### PUT `/api/restaurants/:id/branding`

Actualiza los colores, logos y preferencias de layout del restaurante.

**Request Body:**

```json
{
  "colors": {
    "primary": "#dc2626",
    "secondary": "#7c3aed",
    "accent": "#f59e0b",
    "background": "#ffffff"
  },
  "logo": "https://example.com/new-logo.png",
  "favicon": "https://example.com/favicon.ico",
  "coverImage": "https://example.com/new-cover.jpg",
  "layout": {
    "showHeroSection": true,
    "showTestimonials": true,
    "menuLayout": "GRID"
  }
}
```

**Validation Rules:**

- Colores: Formato hexadecimal (#RRGGBB)
- URLs: Formato válido de URL
- `menuLayout`: "GRID" | "LIST" | "CARDS"

**Response 200:**

```json
{
  "success": true,
  "branding": {
    "primaryColor": "#dc2626",
    "secondaryColor": "#7c3aed",
    "accentColor": "#f59e0b",
    "backgroundColor": "#ffffff",
    "logo": "https://example.com/new-logo.png",
    "coverImage": "https://example.com/new-cover.jpg",
    "showHeroSection": true,
    "menuStyle": "GRID",
    "updatedAt": "2025-11-26T20:30:00Z"
  }
}
```

**Error 400:** Color inválido

```json
{
  "statusCode": 400,
  "message": ["Invalid hex color format for primary"],
  "error": "Bad Request"
}
```

---

## 💳 Métodos de Pago

### PUT `/api/restaurants/:id/payment-methods`

Configura los métodos de pago aceptados por el restaurante.

> ⚠️ **Estado:** Implementación parcial. Requiere migración de schema para almacenar la configuración.

**Request Body:**

```json
{
  "paymentMethods": ["cash", "debit-card", "credit-card", "digital-wallet"],
  "acceptsOnlinePayment": true,
  "requiresPaymentOnDelivery": false
}
```

**Métodos de Pago Disponibles:**

- `cash` - Efectivo
- `debit-card` - Tarjeta de débito
- `credit-card` - Tarjeta de crédito
- `bank-transfer` - Transferencia bancaria
- `digital-wallet` - Billetera digital (MercadoPago, etc.)
- `crypto` - Criptomonedas

**Response 200:**

```json
{
  "success": true,
  "paymentMethods": ["cash", "debit-card", "credit-card", "digital-wallet"],
  "updatedAt": "2025-11-26T20:30:00Z"
}
```

---

## 🚚 Zonas de Delivery

### PUT `/api/restaurants/:id/delivery-zones`

Configura las zonas de delivery con tarifas, mínimos y tiempos estimados.

**Request Body:**

```json
{
  "enableDelivery": true,
  "deliveryZones": [
    {
      "name": "Centro",
      "deliveryFee": 50000,
      "minOrder": 300000,
      "estimatedTime": "30-40 min",
      "areas": ["Microcentro", "Retiro", "San Nicolás"]
    },
    {
      "name": "Zona Norte",
      "deliveryFee": 80000,
      "minOrder": 400000,
      "estimatedTime": "40-50 min",
      "areas": ["Belgrano", "Núñez", "Palermo"]
    }
  ]
}
```

**Validation Rules:**

- `deliveryFee`: Entero positivo en centavos
- `minOrder`: Entero positivo en centavos
- `estimatedTime`: String descriptivo
- `areas`: Array de strings (nombres de barrios/zonas)

**Response 200:**

```json
{
  "success": true,
  "deliveryZones": [
    {
      "id": "zone_1",
      "name": "Centro",
      "fee": 50000,
      "minOrder": 300000,
      "estimatedTime": "30-40 min",
      "coordinates": {
        "areas": ["Microcentro", "Retiro", "San Nicolás"]
      },
      "isActive": true
    }
  ],
  "updatedAt": "2025-11-26T20:30:00Z"
}
```

**Nota:** Los valores monetarios se guardan en **centavos** para evitar problemas de redondeo. Ejemplo: $500.00 = 50000 centavos.

---

## 👥 Gestión de Usuarios

### GET `/api/restaurants/:id/users`

Lista todos los usuarios asociados al restaurante.

**Query Parameters:** Ninguno

**Response 200:**

```json
{
  "success": true,
  "users": [
    {
      "id": "user_1",
      "email": "owner@restaurant.com",
      "name": "Juan Pérez",
      "role": "OWNER",
      "isActive": true,
      "createdAt": "2025-01-15T10:00:00Z"
    },
    {
      "id": "user_2",
      "email": "manager@restaurant.com",
      "name": "María González",
      "role": "MANAGER",
      "isActive": true,
      "createdAt": "2025-02-20T14:30:00Z"
    }
  ]
}
```

---

### POST `/api/restaurants/:id/users`

Invita un nuevo usuario al restaurante.

**Request Body:**

```json
{
  "email": "nuevo@restaurant.com",
  "name": "Carlos Rodríguez",
  "role": "WAITER",
  "sendInvitation": true
}
```

**Validation Rules:**

- `email`: Email válido y único
- `role`: Uno de: OWNER, ADMIN, MANAGER, WAITER, KITCHEN
- `sendInvitation`: Si es true, envía email de invitación (TODO)

**Response 200:**

```json
{
  "success": true,
  "user": {
    "id": "user_3",
    "email": "nuevo@restaurant.com",
    "name": "Carlos Rodríguez",
    "role": "WAITER",
    "isActive": true,
    "createdAt": "2025-11-26T20:30:00Z"
  }
}
```

**Error 409:** Usuario ya existe

```json
{
  "statusCode": 409,
  "message": "User already exists in this restaurant",
  "error": "Conflict"
}
```

---

### PUT `/api/restaurants/:id/users/:userId`

Actualiza el rol o estado de un usuario.

**Request Body:**

```json
{
  "role": "MANAGER",
  "isActive": true
}
```

**Response 200:**

```json
{
  "success": true,
  "user": {
    "id": "user_3",
    "email": "nuevo@restaurant.com",
    "name": "Carlos Rodríguez",
    "role": "MANAGER",
    "isActive": true,
    "createdAt": "2025-11-26T20:00:00Z"
  }
}
```

**Error 404:** Usuario no encontrado

```json
{
  "statusCode": 404,
  "message": "User not found in this restaurant",
  "error": "Not Found"
}
```

---

### DELETE `/api/restaurants/:id/users/:userId`

Remueve un usuario del restaurante. Solo el OWNER puede eliminar usuarios.

**Response 200:**

```json
{
  "success": true,
  "message": "User removed successfully"
}
```

**Error 403:** No tienes permiso

```json
{
  "statusCode": 403,
  "message": "Only the owner can remove users",
  "error": "Forbidden"
}
```

**Error 409:** No se puede eliminar al owner

```json
{
  "statusCode": 409,
  "message": "Cannot remove the restaurant owner",
  "error": "Conflict"
}
```

---

## 🔐 Roles y Permisos

### GET `/api/restaurants/:id/roles`

Obtiene la lista de roles disponibles con sus permisos.

**Response 200:**

```json
{
  "roles": [
    {
      "id": "owner",
      "name": "Dueño",
      "permissions": [
        "manage_users",
        "manage_settings",
        "manage_menu",
        "manage_orders",
        "manage_reservations",
        "manage_tables",
        "view_analytics",
        "manage_billing"
      ],
      "color": "#ef4444"
    },
    {
      "id": "admin",
      "name": "Administrador",
      "permissions": [
        "manage_settings",
        "manage_menu",
        "manage_orders",
        "manage_reservations",
        "manage_tables",
        "view_analytics"
      ],
      "color": "#f59e0b"
    },
    {
      "id": "manager",
      "name": "Gerente",
      "permissions": [
        "manage_menu",
        "manage_orders",
        "manage_reservations",
        "manage_tables"
      ],
      "color": "#3b82f6"
    },
    {
      "id": "waiter",
      "name": "Mozo",
      "permissions": ["manage_orders", "view_tables"],
      "color": "#10b981"
    },
    {
      "id": "kitchen",
      "name": "Cocina",
      "permissions": ["view_orders", "update_order_status"],
      "color": "#8b5cf6"
    }
  ]
}
```

**Descripción de Permisos:**

- `manage_users`: Gestionar usuarios (invitar, actualizar, eliminar)
- `manage_settings`: Configurar restaurante (horarios, branding, etc.)
- `manage_menu`: CRUD de menú (categorías, platos)
- `manage_orders`: Gestionar órdenes (crear, actualizar estado)
- `manage_reservations`: Gestionar reservas
- `manage_tables`: Gestionar mesas y áreas
- `view_analytics`: Ver estadísticas y reportes
- `manage_billing`: Gestionar facturación y pagos
- `view_orders`: Solo ver órdenes
- `update_order_status`: Actualizar estado de órdenes
- `view_tables`: Solo ver estado de mesas

---

## ⚠️ Códigos de Error

### Errores de Autenticación

| Código | Mensaje                         | Descripción                 |
| ------ | ------------------------------- | --------------------------- |
| 401    | Unauthorized                    | Token inválido o expirado   |
| 403    | You can only update your own... | No tienes acceso al recurso |
| 403    | Only the owner can remove users | Acción solo para OWNER      |

### Errores de Validación

| Código | Mensaje                      | Descripción                  |
| ------ | ---------------------------- | ---------------------------- |
| 400    | Invalid hex color format     | Color no es hexadecimal      |
| 400    | Invalid CUIT/CUIL format     | Formato de CUIT incorrecto   |
| 400    | Invalid time format          | Tiempo no es HH:mm           |
| 400    | Invalid email format         | Email inválido               |
| 400    | deliveryFee must be positive | Valor monetario debe ser > 0 |

### Errores de Negocio

| Código | Mensaje                            | Descripción                   |
| ------ | ---------------------------------- | ----------------------------- |
| 404    | Restaurant not found               | Restaurante no existe         |
| 404    | User not found in this restaurant  | Usuario no pertenece al local |
| 409    | User already exists...             | Email ya registrado           |
| 409    | Cannot remove the restaurant owner | No se puede eliminar al dueño |

---

## 💡 Ejemplos de Integración

### React + TypeScript - Service Class

```typescript
// services/settings.service.ts
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export interface BrandingColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface BrandingLayout {
  showHeroSection: boolean;
  showTestimonials?: boolean;
  menuLayout: 'GRID' | 'LIST' | 'CARDS';
}

export interface UpdateBrandingDto {
  colors?: BrandingColors;
  logo?: string;
  favicon?: string;
  coverImage?: string;
  layout?: BrandingLayout;
}

export interface DeliveryZone {
  name: string;
  deliveryFee: number; // en centavos
  minOrder: number; // en centavos
  estimatedTime: string;
  areas: string[];
}

export interface InviteUserDto {
  email: string;
  name?: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN';
  sendInvitation?: boolean;
}

export class SettingsService {
  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  async updateBranding(restaurantId: string, data: UpdateBrandingDto) {
    const response = await axios.put(
      `${API_URL}/restaurants/${restaurantId}/branding`,
      data,
      this.getAuthHeaders(),
    );
    return response.data;
  }

  async updateDeliveryZones(
    restaurantId: string,
    zones: DeliveryZone[],
    enableDelivery: boolean,
  ) {
    const response = await axios.put(
      `${API_URL}/restaurants/${restaurantId}/delivery-zones`,
      { deliveryZones: zones, enableDelivery },
      this.getAuthHeaders(),
    );
    return response.data;
  }

  async getRestaurantUsers(restaurantId: string) {
    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/users`,
      this.getAuthHeaders(),
    );
    return response.data.users;
  }

  async inviteUser(restaurantId: string, data: InviteUserDto) {
    const response = await axios.post(
      `${API_URL}/restaurants/${restaurantId}/users`,
      data,
      this.getAuthHeaders(),
    );
    return response.data.user;
  }

  async updateUserRole(
    restaurantId: string,
    userId: string,
    role: string,
    isActive: boolean,
  ) {
    const response = await axios.put(
      `${API_URL}/restaurants/${restaurantId}/users/${userId}`,
      { role, isActive },
      this.getAuthHeaders(),
    );
    return response.data.user;
  }

  async removeUser(restaurantId: string, userId: string) {
    const response = await axios.delete(
      `${API_URL}/restaurants/${restaurantId}/users/${userId}`,
      this.getAuthHeaders(),
    );
    return response.data;
  }

  async getRoles(restaurantId: string) {
    const response = await axios.get(
      `${API_URL}/restaurants/${restaurantId}/roles`,
      this.getAuthHeaders(),
    );
    return response.data.roles;
  }
}

export const settingsService = new SettingsService();
```

### React Component - Branding Settings

```tsx
// components/BrandingSettings.tsx
import React, { useState } from 'react';
import { settingsService } from '../services/settings.service';

export const BrandingSettings: React.FC<{ restaurantId: string }> = ({
  restaurantId,
}) => {
  const [colors, setColors] = useState({
    primary: '#dc2626',
    secondary: '#7c3aed',
    accent: '#f59e0b',
    background: '#ffffff',
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const result = await settingsService.updateBranding(restaurantId, {
        colors,
        layout: {
          showHeroSection: true,
          menuLayout: 'GRID',
        },
      });
      console.log('Branding actualizado:', result);
      alert('Cambios guardados exitosamente!');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar los cambios');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Branding y Apariencia</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Color Primario
          </label>
          <input
            type="color"
            value={colors.primary}
            onChange={(e) => setColors({ ...colors, primary: e.target.value })}
            className="w-full h-12 rounded border"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Color Secundario
          </label>
          <input
            type="color"
            value={colors.secondary}
            onChange={(e) =>
              setColors({ ...colors, secondary: e.target.value })
            }
            className="w-full h-12 rounded border"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Color de Acento
          </label>
          <input
            type="color"
            value={colors.accent}
            onChange={(e) => setColors({ ...colors, accent: e.target.value })}
            className="w-full h-12 rounded border"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Fondo</label>
          <input
            type="color"
            value={colors.background}
            onChange={(e) =>
              setColors({ ...colors, background: e.target.value })
            }
            className="w-full h-12 rounded border"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Guardando...' : 'Guardar Cambios'}
      </button>
    </div>
  );
};
```

### React Component - User Management

```tsx
// components/UserManagement.tsx
import React, { useEffect, useState } from 'react';
import { settingsService } from '../services/settings.service';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export const UserManagement: React.FC<{ restaurantId: string }> = ({
  restaurantId,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersData, rolesData] = await Promise.all([
        settingsService.getRestaurantUsers(restaurantId),
        settingsService.getRoles(restaurantId),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    const email = prompt('Email del nuevo usuario:');
    if (!email) return;

    try {
      await settingsService.inviteUser(restaurantId, {
        email,
        role: 'WAITER',
        sendInvitation: true,
      });
      alert('Usuario invitado exitosamente!');
      loadData();
    } catch (error) {
      console.error('Error inviting user:', error);
      alert('Error al invitar usuario');
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;

    try {
      await settingsService.removeUser(restaurantId, userId);
      alert('Usuario eliminado exitosamente!');
      loadData();
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Error al eliminar usuario');
    }
  };

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Gestión de Usuarios</h2>
        <button
          onClick={handleInviteUser}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          + Invitar Usuario
        </button>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3">Nombre</th>
            <th className="text-left p-3">Email</th>
            <th className="text-left p-3">Rol</th>
            <th className="text-left p-3">Estado</th>
            <th className="text-left p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-gray-50">
              <td className="p-3">{user.name}</td>
              <td className="p-3">{user.email}</td>
              <td className="p-3">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                  {user.role}
                </span>
              </td>
              <td className="p-3">
                {user.isActive ? (
                  <span className="text-green-600">Activo</span>
                ) : (
                  <span className="text-red-600">Inactivo</span>
                )}
              </td>
              <td className="p-3">
                {user.role !== 'OWNER' && (
                  <button
                    onClick={() => handleRemoveUser(user.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

### cURL - Ejemplos de Testing

```bash
# 1. Actualizar branding
curl -X PUT http://localhost:3000/api/restaurants/rest_abc123/branding \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "colors": {
      "primary": "#dc2626",
      "secondary": "#7c3aed"
    },
    "layout": {
      "showHeroSection": true,
      "menuLayout": "GRID"
    }
  }'

# 2. Configurar zonas de delivery
curl -X PUT http://localhost:3000/api/restaurants/rest_abc123/delivery-zones \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enableDelivery": true,
    "deliveryZones": [
      {
        "name": "Centro",
        "deliveryFee": 50000,
        "minOrder": 300000,
        "estimatedTime": "30-40 min",
        "areas": ["Microcentro", "Retiro"]
      }
    ]
  }'

# 3. Listar usuarios
curl http://localhost:3000/api/restaurants/rest_abc123/users \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Invitar usuario
curl -X POST http://localhost:3000/api/restaurants/rest_abc123/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuevo@restaurant.com",
    "name": "Carlos Rodríguez",
    "role": "WAITER"
  }'

# 5. Actualizar rol de usuario
curl -X PUT http://localhost:3000/api/restaurants/rest_abc123/users/user_3 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "MANAGER",
    "isActive": true
  }'

# 6. Eliminar usuario (solo OWNER)
curl -X DELETE http://localhost:3000/api/restaurants/rest_abc123/users/user_3 \
  -H "Authorization: Bearer YOUR_TOKEN"

# 7. Obtener roles y permisos
curl http://localhost:3000/api/restaurants/rest_abc123/roles \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📝 Checklist de Testing

### Información General

- [ ] Actualizar nombre del restaurante
- [ ] Validar formato de CUIT/CUIL
- [ ] Actualizar email y teléfono
- [ ] Validar URLs de logo y cover
- [ ] Verificar que solo el owner puede actualizar

### Horarios

- [ ] Configurar horarios para todos los días
- [ ] Marcar días cerrados
- [ ] Validar formato HH:mm
- [ ] Actualizar horarios existentes
- [ ] Verificar que se eliminan horarios viejos

### Branding

- [ ] Actualizar colores hexadecimales
- [ ] Validar formato de color
- [ ] Cambiar layout del menú
- [ ] Actualizar logo y favicon
- [ ] Verificar preview en frontend

### Delivery Zones

- [ ] Crear múltiples zonas
- [ ] Configurar tarifas en centavos
- [ ] Definir mínimo de orden
- [ ] Asignar áreas a zonas
- [ ] Habilitar/deshabilitar delivery

### Usuarios

- [ ] Listar usuarios del restaurante
- [ ] Invitar nuevo usuario
- [ ] Validar email único
- [ ] Actualizar rol de usuario
- [ ] Activar/desactivar usuario
- [ ] Eliminar usuario (solo OWNER)
- [ ] Verificar que no se puede eliminar OWNER
- [ ] Verificar permisos por rol

### Roles y Permisos

- [ ] Listar roles disponibles
- [ ] Verificar permisos de cada rol
- [ ] Validar colores de roles
- [ ] Probar restricciones por rol

---

## 🎯 Mejores Prácticas

### Frontend

1. **Validación Client-Side**: Valida formatos antes de enviar (emails, colores hex, tiempos HH:mm)
2. **Confirmaciones**: Pide confirmación antes de eliminar usuarios
3. **Feedback Visual**: Muestra estados de carga y mensajes de éxito/error
4. **Preview en Vivo**: Muestra preview de branding antes de guardar
5. **Conversión de Valores**: Recuerda convertir centavos a pesos para display ($500.00 = 50000 centavos)

### Backend

1. **Autenticación**: Siempre verifica que `user.restaurantId === restaurantId`
2. **Roles**: Implementa middleware de permisos para acciones sensibles
3. **Validación**: Usa class-validator para todas las DTOs
4. **Transacciones**: Usa transacciones para operaciones críticas (ej: reemplazar horarios)
5. **Soft Delete**: Desactiva usuarios en lugar de eliminarlos permanentemente

---

## 🚀 Próximas Mejoras

1. **Sistema de Invitaciones**: Enviar emails con links mágicos para nuevos usuarios
2. **Payment Methods Storage**: Migración para guardar configuración de pagos en JSON
3. **Geofencing**: Usar coordenadas GPS para delivery zones
4. **Audit Log**: Registrar cambios de configuración con usuario y timestamp
5. **Webhooks**: Notificar cambios de configuración a servicios externos
6. **Multi-idioma**: Soporte para múltiples idiomas en configuración

---

**¿Necesitas ayuda?** Revisa la documentación completa en:

- `ANALYTICS_API.md` - Analíticas y reportes
- `TABLES_MANAGEMENT_API.md` - Gestión de mesas
- `RESERVATIONS_API.md` - Sistema de reservas
- `API_EXAMPLES.md` - Ejemplos de todos los flujos
