# API Documentation - Restaurant Management Backend

## Base URL

- Development: `http://localhost:3000`
- Production: Configure in environment variables

---

## Authentication Endpoints

### POST `/api/auth/register`

**Public** - Register a new user and optionally create a restaurant

**Body:**

```json
{
  "email": "admin@restaurant.com",
  "password": "securePassword123",
  "name": "John Doe",
  "role": "ADMIN",
  "restaurantConfig": {
    "businessInfo": {
      "name": "Mi Restaurante",
      "type": "restaurant",
      "cuisineTypes": ["Italian", "Pizza"],
      "description": "Best pizza in town"
    },
    "contact": {
      "email": "contact@restaurant.com",
      "phone": "+5491123456789",
      "address": "Av. Corrientes 1234",
      "city": "Buenos Aires",
      "country": "Argentina",
      "postalCode": "C1043"
    },
    "branding": {
      "colors": {
        "primary": "#4f46e5",
        "secondary": "#9333ea",
        "accent": "#ec4899",
        "background": "#ffffff"
      },
      "layout": {
        "menuStyle": "grid",
        "showHeroSection": true,
        "categoryDisplay": "tabs"
      }
    },
    "businessRules": {
      "orders": {
        "minOrderAmount": 1000,
        "orderLeadTime": 30
      }
    },
    "features": {
      "delivery": true,
      "reservations": true,
      "loyalty": false
    },
    "hours": {
      "monday": { "isOpen": true, "openTime": "09:00", "closeTime": "22:00" },
      "tuesday": { "isOpen": true, "openTime": "09:00", "closeTime": "22:00" }
    }
  }
}
```

### POST `/api/auth/login`

**Public** - Login and receive JWT token

**Body:**

```json
{
  "email": "admin@restaurant.com",
  "password": "securePassword123"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx...",
    "email": "admin@restaurant.com",
    "name": "John Doe",
    "role": "ADMIN"
  }
}
```

### GET `/api/auth/me`

**Protected** - Get current user information

**Headers:** `Authorization: Bearer <token>`

---

## Restaurant Endpoints

### GET `/api/restaurants/slug/:slug`

**Public** - Get restaurant by slug (for public menu)

### GET `/api/restaurants/me`

**Protected** - Get my restaurant details

### POST `/api/restaurants`

**Protected** - Create a new restaurant

### PATCH `/api/restaurants/:id`

**Protected** - Update restaurant configuration

---

## Menu - Categories

### GET `/api/menu/:restaurantId/categories`

**Public** - Get all categories with dishes for public menu

### GET `/api/categories/restaurant/:restaurantId`

**Protected** - Get all categories (admin view)

### POST `/api/categories/restaurant/:restaurantId`

**Protected** - Create a new category

**Body:**

```json
{
  "name": "Pizzas",
  "description": "Our delicious pizzas",
  "image": "https://example.com/pizza.jpg"
}
```

### PATCH `/api/categories/:id/restaurant/:restaurantId`

**Protected** - Update category

### DELETE `/api/categories/:id/restaurant/:restaurantId`

**Protected** - Soft delete category

### PATCH `/api/categories/reorder/restaurant/:restaurantId`

**Protected** - Reorder categories

**Body:**

```json
{
  "categories": [
    { "id": "cat1", "order": 0 },
    { "id": "cat2", "order": 1 }
  ]
}
```

---

## Menu - Dishes

### GET `/api/dishes/restaurant/:restaurantId`

**Protected** - Get all dishes with filters

**Query params:**

- `categoryId` - Filter by category
- `isAvailable` - Filter by availability (true/false)
- `isFeatured` - Filter featured dishes (true/false)
- `search` - Search in name/description

### POST `/api/dishes/restaurant/:restaurantId`

**Protected** - Create a new dish

**Body:**

```json
{
  "categoryId": "clx...",
  "name": "Margherita Pizza",
  "description": "Classic tomato and mozzarella",
  "price": 1500,
  "image": "https://example.com/margherita.jpg",
  "preparationTime": 15,
  "calories": 800,
  "allergens": ["gluten", "dairy"],
  "tags": ["vegetarian", "popular"],
  "isFeatured": true
}
```

### PATCH `/api/dishes/:id/restaurant/:restaurantId`

**Protected** - Update dish

### DELETE `/api/dishes/:id/restaurant/:restaurantId`

**Protected** - Soft delete dish

### PATCH `/api/dishes/:id/restaurant/:restaurantId/availability`

**Protected** - Toggle dish availability

**Body:**

```json
{
  "isAvailable": false
}
```

---

## Orders

### POST `/api/orders/:restaurantId`

**Public** - Create a new order from public menu

**Body:**

```json
{
  "customerName": "Maria Lopez",
  "customerEmail": "maria@example.com",
  "customerPhone": "+5491123456789",
  "type": "DELIVERY",
  "paymentMethod": "mercadopago",
  "deliveryAddress": "Av. Belgrano 1234, CABA",
  "tip": 200,
  "notes": "Sin cebolla por favor",
  "items": [
    {
      "dishId": "clx...",
      "quantity": 2,
      "notes": "Extra queso"
    },
    {
      "dishId": "clx...",
      "quantity": 1
    }
  ]
}
```

**Response:**

```json
{
  "id": "clx...",
  "customerName": "Maria Lopez",
  "type": "DELIVERY",
  "status": "PENDING",
  "subtotal": 3000,
  "deliveryFee": 500,
  "tip": 200,
  "total": 3700,
  "items": [...],
  "statusHistory": [...]
}
```

### GET `/api/orders/restaurant/:restaurantId`

**Protected** - Get all orders with filters

**Query params:**

- `status` - PENDING, CONFIRMED, PREPARING, READY, DELIVERED, CANCELLED
- `type` - DINE_IN, PICKUP, DELIVERY
- `startDate` - ISO date string
- `endDate` - ISO date string
- `customerPhone` - Search by phone

### GET `/api/orders/restaurant/:restaurantId/stats`

**Protected** - Get order statistics

**Response:**

```json
{
  "totalOrders": 1523,
  "todayOrders": 45,
  "pendingOrders": 8,
  "revenue": 458700
}
```

### GET `/api/orders/:id/restaurant/:restaurantId`

**Protected** - Get order details

### PATCH `/api/orders/:id/restaurant/:restaurantId/status`

**Protected** - Update order status

**Body:**

```json
{
  "status": "PREPARING",
  "notes": "Started preparing order"
}
```

---

## Tables

### POST `/api/tables/restaurant/:restaurantId`

**Protected** - Create a new table

**Body:**

```json
{
  "number": "T1",
  "capacity": 4,
  "section": "Interior"
}
```

### GET `/api/tables/restaurant/:restaurantId`

**Protected** - Get all tables

### GET `/api/tables/:id/restaurant/:restaurantId`

**Protected** - Get table with active orders

### PATCH `/api/tables/:id/restaurant/:restaurantId`

**Protected** - Update table

### PATCH `/api/tables/:id/restaurant/:restaurantId/status/:status`

**Protected** - Change table status

**Status values:** AVAILABLE, OCCUPIED, RESERVED, CLEANING

### DELETE `/api/tables/:id/restaurant/:restaurantId`

**Protected** - Delete table

---

## MercadoPago (Multi-tenant)

Estos endpoints permiten conectar **un Access Token por restaurante** (persistido en Postgres y encriptado) y crear preferencias server-side.

### GET `/api/mercadopago/tenant-token?restaurantId=...`

**Protected** - Estado de conexión MercadoPago para un restaurante.

**Response:**

```json
{
  "connected": true,
  "createdAt": "2025-12-14T00:00:00.000Z"
}
```

### POST `/api/mercadopago/tenant-token`

**Protected** - Guarda/actualiza el Access Token del restaurante (encriptado).

**Body:**

```json
{
  "restaurantId": "...",
  "accessToken": "..."
}
```

**Response:**

```json
{ "success": true }
```

### DELETE `/api/mercadopago/tenant-token`

**Protected** - Borra el Access Token asociado al restaurante.

**Body:**

```json
{ "restaurantId": "..." }
```

**Response:**

```json
{ "success": true }
```

### POST `/api/mercadopago/preference`

**Public** - Crea preferencia de MercadoPago.

**Body:**

```json
{
  "slug": "mi-resto",
  "restaurantId": "...",
  "orderId": "...",
  "items": [{ "title": "Hamburguesa", "quantity": 1, "unit_price": 12000 }]
}
```

**Response:**

```json
{
  "preference": {
    "id": "...",
    "init_point": "...",
    "sandbox_init_point": "..."
  }
}
```

### POST `/api/mercadopago/webhook`

**Public** - Webhook MercadoPago (recomendado). Guarda evento con idempotencia.

---

## Payments (MercadoPago) (Legacy/Compat)

### POST `/api/payments/create-preference/:orderId`

**Protected** - Create MercadoPago payment preference

**Response:**

```json
{
  "preferenceId": "123456789-abc-def",
  "initPoint": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "sandboxInitPoint": "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
}
```

### POST `/api/payments/webhook`

**Public** - MercadoPago webhook endpoint (configured in MP dashboard)

### GET `/api/payments/status/:orderId`

**Protected** - Get payment status for an order

**Response:**

```json
{
  "paymentStatus": "PAID",
  "paymentId": "123456789",
  "preferenceId": "abc-def-ghi",
  "status": "CONFIRMED"
}
```

---

## Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/resto_db?schema=public"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN="your-mercadopago-access-token" # opcional como fallback global
MP_TOKEN_ENCRYPTION_KEY="" # requerida para multi-tenant (32 bytes: hex 64 chars o base64 32 bytes)
BASE_URL="http://localhost:3000" # recomendado
MERCADOPAGO_NOTIFICATION_URL="" # opcional

# URLs
FRONTEND_URL="http://localhost:5173"
BACKEND_URL="http://localhost:3000"
```

---

## Order Status Flow

Valid transitions:

- PENDING → CONFIRMED, CANCELLED
- CONFIRMED → PREPARING, CANCELLED
- PREPARING → READY, CANCELLED
- READY → DELIVERED, CANCELLED
- DELIVERED → (final state)
- CANCELLED → (final state)

---

## Payment Status

- **PENDING**: Payment not completed
- **PAID**: Payment approved
- **FAILED**: Payment rejected or cancelled
- **REFUNDED**: Payment refunded

---

## Notes

1. All **Protected** endpoints require `Authorization: Bearer <token>` header
2. Prices are stored in **centavos** (multiply by 100 for AR pesos)
3. The system uses **soft delete** for categories and dishes (deletedAt field)
4. Restaurant ownership is automatically validated on all admin endpoints
5. Recomendado: configurar MercadoPago webhook apuntando a `/api/mercadopago/webhook` (legacy: `/api/payments/webhook`)
