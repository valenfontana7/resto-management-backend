# API Usage Examples

Ejemplos de cómo usar la API con curl o herramientas similares.

## 1. Registro y Autenticación

### Registrar usuario con restaurante

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@mipizza.com",
    "password": "MiPassword123!",
    "name": "Juan Pérez",
    "role": "ADMIN",
    "restaurantConfig": {
      "businessInfo": {
        "name": "La Pizzería del Centro",
        "type": "restaurant",
        "cuisineTypes": ["Italian", "Pizza"],
        "description": "Las mejores pizzas artesanales de Buenos Aires"
      },
      "contact": {
        "email": "contacto@lapizzeria.com",
        "phone": "+5491123456789",
        "address": "Av. Corrientes 1234",
        "city": "CABA",
        "country": "Argentina",
        "postalCode": "C1043"
      },
      "branding": {
        "colors": {
          "primary": "#D32F2F",
          "secondary": "#FFA000",
          "accent": "#388E3C",
          "background": "#FFFFFF"
        },
        "layout": {
          "menuStyle": "grid",
          "showHeroSection": true,
          "categoryDisplay": "tabs"
        }
      },
      "businessRules": {
        "orders": {
          "minOrderAmount": 1500,
          "orderLeadTime": 30
        }
      },
      "features": {
        "delivery": true,
        "reservations": true,
        "loyalty": false
      },
      "hours": {
        "monday": { "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
        "tuesday": { "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
        "wednesday": { "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
        "thursday": { "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
        "friday": { "isOpen": true, "openTime": "11:00", "closeTime": "01:00" },
        "saturday": { "isOpen": true, "openTime": "11:00", "closeTime": "01:00" },
        "sunday": { "isOpen": true, "openTime": "18:00", "closeTime": "23:00" }
      }
    }
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@mipizza.com",
    "password": "MiPassword123!"
  }'
```

Respuesta:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx...",
    "email": "admin@mipizza.com",
    "name": "Juan Pérez",
    "role": "ADMIN"
  }
}
```

**Guardar el `access_token` para usar en siguientes requests**

### Obtener mi información

```bash
TOKEN="tu_access_token_aqui"

curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## 2. Gestión de Menú

### Crear categoría

```bash
RESTAURANT_ID="tu_restaurant_id"

curl -X POST http://localhost:3000/api/categories/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pizzas Clásicas",
    "description": "Nuestras pizzas tradicionales con recetas italianas auténticas",
    "image": "https://example.com/pizzas-clasicas.jpg"
  }'
```

### Crear platos

```bash
CATEGORY_ID="tu_category_id"

# Pizza Margherita
curl -X POST http://localhost:3000/api/dishes/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "'$CATEGORY_ID'",
    "name": "Pizza Margherita",
    "description": "Salsa de tomate, mozzarella, albahaca fresca y aceite de oliva",
    "price": 1800,
    "preparationTime": 15,
    "calories": 800,
    "allergens": ["gluten", "dairy"],
    "tags": ["vegetarian", "classic"],
    "isFeatured": true,
    "isAvailable": true
  }'

# Pizza Napolitana
curl -X POST http://localhost:3000/api/dishes/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "'$CATEGORY_ID'",
    "name": "Pizza Napolitana",
    "description": "Salsa de tomate, mozzarella, tomate en rodajas, ajo y orégano",
    "price": 2000,
    "preparationTime": 15,
    "calories": 850,
    "allergens": ["gluten", "dairy"],
    "tags": ["vegetarian", "popular"],
    "isFeatured": true,
    "isAvailable": true
  }'
```

### Obtener menú público

```bash
curl http://localhost:3000/api/menu/$RESTAURANT_ID/categories
```

### Reordenar categorías

```bash
CAT1_ID="category_id_1"
CAT2_ID="category_id_2"

curl -X PATCH http://localhost:3000/api/categories/reorder/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categories": [
      { "id": "'$CAT1_ID'", "order": 0 },
      { "id": "'$CAT2_ID'", "order": 1 }
    ]
  }'
```

## 3. Gestión de Mesas

### Crear mesas

```bash
# Mesa 1
curl -X POST http://localhost:3000/api/tables/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "1",
    "capacity": 4,
    "section": "Salón Principal"
  }'

# Mesa 2
curl -X POST http://localhost:3000/api/tables/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "2",
    "capacity": 2,
    "section": "Terraza"
  }'
```

### Cambiar estado de mesa

```bash
TABLE_ID="table_id"

curl -X PATCH http://localhost:3000/api/tables/$TABLE_ID/restaurant/$RESTAURANT_ID/status/OCCUPIED \
  -H "Authorization: Bearer $TOKEN"
```

### Listar mesas

```bash
curl http://localhost:3000/api/tables/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN"
```

## 4. Pedidos

### Crear pedido (cliente)

```bash
DISH1_ID="dish_id_margherita"
DISH2_ID="dish_id_napolitana"

curl -X POST http://localhost:3000/api/orders/$RESTAURANT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "María González",
    "customerEmail": "maria@example.com",
    "customerPhone": "+5491198765432",
    "type": "DELIVERY",
    "paymentMethod": "mercadopago",
    "deliveryAddress": "Av. Belgrano 2500, CABA",
    "tip": 300,
    "notes": "Sin cebolla, por favor",
    "items": [
      {
        "dishId": "'$DISH1_ID'",
        "quantity": 2,
        "notes": "Extra queso"
      },
      {
        "dishId": "'$DISH2_ID'",
        "quantity": 1
      }
    ]
  }'
```

### Listar pedidos (admin)

```bash
# Todos los pedidos
curl http://localhost:3000/api/orders/restaurant/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN"

# Pedidos pendientes
curl "http://localhost:3000/api/orders/restaurant/$RESTAURANT_ID?status=PENDING" \
  -H "Authorization: Bearer $TOKEN"

# Pedidos de hoy
TODAY=$(date -I)
curl "http://localhost:3000/api/orders/restaurant/$RESTAURANT_ID?startDate=$TODAY" \
  -H "Authorization: Bearer $TOKEN"
```

### Cambiar estado de pedido

```bash
ORDER_ID="order_id"

# Confirmar pedido
curl -X PATCH http://localhost:3000/api/orders/$ORDER_ID/restaurant/$RESTAURANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CONFIRMED",
    "notes": "Pedido confirmado"
  }'

# Marcar como preparando
curl -X PATCH http://localhost:3000/api/orders/$ORDER_ID/restaurant/$RESTAURANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PREPARING"
  }'

# Marcar como listo
curl -X PATCH http://localhost:3000/api/orders/$ORDER_ID/restaurant/$RESTAURANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "READY"
  }'
```

### Estadísticas de pedidos

```bash
curl http://localhost:3000/api/orders/restaurant/$RESTAURANT_ID/stats \
  -H "Authorization: Bearer $TOKEN"
```

## 5. Pagos con MercadoPago

### Crear preferencia de pago

```bash
ORDER_ID="order_id"

curl -X POST http://localhost:3000/api/payments/create-preference/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN"
```

Respuesta:

```json
{
  "preferenceId": "123456789-abc-def",
  "initPoint": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "sandboxInitPoint": "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
}
```

**Redirigir al cliente a `initPoint` para pagar**

### Consultar estado de pago

```bash
curl http://localhost:3000/api/payments/status/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN"
```

## 6. Restaurante Público

### Obtener restaurante por slug

```bash
curl http://localhost:3000/api/restaurants/slug/la-pizzeria-del-centro
```

## 7. Flujo Completo de Uso

### Flujo Cliente (Ordenar Comida)

```bash
# 1. Obtener menú público
curl http://localhost:3000/api/restaurants/slug/la-pizzeria-del-centro

# 2. Ver categorías y platos
curl http://localhost:3000/api/menu/$RESTAURANT_ID/categories

# 3. Crear pedido
curl -X POST http://localhost:3000/api/orders/$RESTAURANT_ID \
  -H "Content-Type: application/json" \
  -d '{ ... }' # ver ejemplo arriba

# 4. Crear preferencia de pago (si el restaurante lo requiere)
# El frontend obtiene el ORDER_ID de la respuesta anterior
curl -X POST http://localhost:3000/api/payments/create-preference/$ORDER_ID

# 5. Cliente es redirigido a MercadoPago
# 6. Webhook actualiza automáticamente el estado del pedido
```

### Flujo Admin (Gestionar Pedidos)

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mipizza.com","password":"MiPassword123!"}'

# 2. Ver pedidos pendientes
curl "http://localhost:3000/api/orders/restaurant/$RESTAURANT_ID?status=PENDING" \
  -H "Authorization: Bearer $TOKEN"

# 3. Confirmar pedido
curl -X PATCH http://localhost:3000/api/orders/$ORDER_ID/restaurant/$RESTAURANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "CONFIRMED"}'

# 4. Actualizar a preparando
curl -X PATCH http://localhost:3000/api/orders/$ORDER_ID/restaurant/$RESTAURANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "PREPARING"}'

# 5. Marcar como listo
curl -X PATCH http://localhost:3000/api/orders/$ORDER_ID/restaurant/$RESTAURANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "READY"}'

# 6. Marcar como entregado
curl -X PATCH http://localhost:3000/api/orders/$ORDER_ID/restaurant/$RESTAURANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "DELIVERED"}'
```

## Notas Importantes

1. **Precios**: Todos los precios están en centavos (ej: 1800 = $18.00 ARS)
2. **Tokens**: Los JWT expiran en 7 días por defecto
3. **IDs**: Usar los IDs reales obtenidos de las respuestas
4. **CORS**: Configurado para permitir todos los orígenes en desarrollo
5. **Webhook**: MercadoPago debe apuntar a `https://tudominio.com/api/payments/webhook`
