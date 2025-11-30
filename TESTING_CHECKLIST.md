# ✅ Backend Validation Checklist

Usa este checklist para validar que todos los endpoints funcionan correctamente antes de conectar con el frontend.

---

## 🔐 Authentication

### [ ] POST `/api/auth/register`

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@restaurant.com",
    "password": "Test123!",
    "name": "Test User",
    "role": "ADMIN"
  }'
```

**Expected:** Status 201, retorna user + token

### [ ] POST `/api/auth/login`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@restaurant.com",
    "password": "Test123!"
  }'
```

**Expected:** Status 200, retorna `{ access_token, user }`
**Save token for next requests!**

### [ ] GET `/api/auth/me`

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, retorna info del usuario

---

## 🏪 Restaurants

### [ ] POST `/api/restaurants`

```bash
curl -X POST http://localhost:3000/api/restaurants \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "businessInfo": {
        "name": "Mi Restaurante Test",
        "type": "restaurant",
        "cuisineTypes": ["Italian"],
        "description": "Test restaurant"
      },
      "contact": {
        "email": "contact@test.com",
        "phone": "+5491123456789",
        "address": "Test 123",
        "city": "CABA",
        "country": "Argentina"
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
      }
    }
  }'
```

**Expected:** Status 201, retorna restaurant con slug
**Save restaurant ID!**

### [ ] GET `/api/restaurants/me`

```bash
curl http://localhost:3000/api/restaurants/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, retorna tu restaurante

---

## 📋 Menu - Categories

### [ ] POST `/api/categories/restaurant/RESTAURANT_ID`

```bash
curl -X POST http://localhost:3000/api/categories/restaurant/RESTAURANT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pizzas",
    "description": "Nuestras deliciosas pizzas"
  }'
```

**Expected:** Status 201, retorna category
**Save category ID!**

### [ ] GET `/api/categories/restaurant/RESTAURANT_ID`

```bash
curl http://localhost:3000/api/categories/restaurant/RESTAURANT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, array de categorías

---

## 🍕 Menu - Dishes

### [ ] POST `/api/dishes/restaurant/RESTAURANT_ID`

```bash
curl -X POST http://localhost:3000/api/dishes/restaurant/RESTAURANT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "CATEGORY_ID",
    "name": "Pizza Margherita",
    "description": "Clásica pizza italiana",
    "price": 1800,
    "isAvailable": true,
    "isFeatured": true
  }'
```

**Expected:** Status 201, retorna dish
**Save dish ID!**

### [ ] GET `/api/dishes/restaurant/RESTAURANT_ID`

```bash
curl http://localhost:3000/api/dishes/restaurant/RESTAURANT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, array de platos

### [ ] GET `/api/dishes/restaurant/RESTAURANT_ID?isAvailable=true`

```bash
curl http://localhost:3000/api/dishes/restaurant/RESTAURANT_ID?isAvailable=true \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, solo platos disponibles

---

## 🛒 Orders (Critical for Dashboard)

### [ ] POST `/api/restaurants/RESTAURANT_ID/orders` (Público)

```bash
curl -X POST http://localhost:3000/api/restaurants/RESTAURANT_ID/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test Customer",
    "customerPhone": "+5491123456789",
    "customerEmail": "customer@test.com",
    "type": "DELIVERY",
    "paymentMethod": "cash",
    "deliveryAddress": "Test Address 123",
    "items": [
      {
        "dishId": "DISH_ID",
        "quantity": 2
      }
    ]
  }'
```

**Expected:** Status 201, retorna order completa
**Save order ID!**

### [ ] GET `/api/restaurants/RESTAURANT_ID/orders`

```bash
curl http://localhost:3000/api/restaurants/RESTAURANT_ID/orders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, `{ orders: [...], count: N }`

### [ ] GET `/api/restaurants/RESTAURANT_ID/orders?status=PENDING`

```bash
curl http://localhost:3000/api/restaurants/RESTAURANT_ID/orders?status=PENDING \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, solo órdenes pendientes

### [ ] GET `/api/restaurants/RESTAURANT_ID/orders/ORDER_ID`

```bash
curl http://localhost:3000/api/restaurants/RESTAURANT_ID/orders/ORDER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, detalle completo de orden

### [ ] PATCH `/api/restaurants/RESTAURANT_ID/orders/ORDER_ID/status`

```bash
curl -X PATCH http://localhost:3000/api/restaurants/RESTAURANT_ID/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CONFIRMED",
    "notes": "Pedido confirmado"
  }'
```

**Expected:** Status 200, `{ order: {...} }` con nuevo status

### [ ] PATCH status a PREPARING

```bash
curl -X PATCH http://localhost:3000/api/restaurants/RESTAURANT_ID/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PREPARING"
  }'
```

**Expected:** Status 200, status cambiado a PREPARING

### [ ] PATCH status a READY

```bash
curl -X PATCH http://localhost:3000/api/restaurants/RESTAURANT_ID/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "READY"
  }'
```

**Expected:** Status 200, status cambiado a READY

### [ ] PATCH status a DELIVERED

```bash
curl -X PATCH http://localhost:3000/api/restaurants/RESTAURANT_ID/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DELIVERED"
  }'
```

**Expected:** Status 200, status cambiado a DELIVERED
**Check:** `deliveredAt` timestamp debe estar presente

---

## 📊 Dashboard Stats (Critical!)

### [ ] GET `/api/restaurants/RESTAURANT_ID/stats/today`

```bash
curl http://localhost:3000/api/restaurants/RESTAURANT_ID/stats/today \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200
**Check structure:**

```json
{
  "today": {
    "revenue": number,
    "orders": number,
    "averageOrder": number,
    "reservations": number
  },
  "yesterday": { ... },
  "percentageChange": {
    "revenue": number,
    "orders": number,
    "averageOrder": number,
    "reservations": number
  }
}
```

### [ ] GET `/api/restaurants/RESTAURANT_ID/stats/top-dishes`

```bash
curl http://localhost:3000/api/restaurants/RESTAURANT_ID/stats/top-dishes \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200
**Check structure:**

```json
{
  "topDishes": [
    {
      "dishId": string,
      "dishName": string,
      "categoryName": string,
      "quantity": number,
      "revenue": number,
      "percentage": number
    }
  ]
}
```

### [ ] GET `/api/restaurants/RESTAURANT_ID/stats/top-dishes?period=week`

```bash
curl http://localhost:3000/api/restaurants/RESTAURANT_ID/stats/top-dishes?period=week \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, stats de la semana

---

## 🪑 Tables

### [ ] POST `/api/tables/restaurant/RESTAURANT_ID`

```bash
curl -X POST http://localhost:3000/api/tables/restaurant/RESTAURANT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "1",
    "capacity": 4,
    "section": "Interior"
  }'
```

**Expected:** Status 201, retorna table
**Save table ID!**

### [ ] GET `/api/tables/restaurant/RESTAURANT_ID`

```bash
curl http://localhost:3000/api/tables/restaurant/RESTAURANT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, array de mesas

### [ ] PATCH `/api/tables/TABLE_ID/restaurant/RESTAURANT_ID/status/OCCUPIED`

```bash
curl -X PATCH http://localhost:3000/api/tables/TABLE_ID/restaurant/RESTAURANT_ID/status/OCCUPIED \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200, table con status OCCUPIED

---

## 💳 Payments (MercadoPago)

### [ ] POST `/api/payments/create-preference/ORDER_ID`

```bash
curl -X POST http://localhost:3000/api/payments/create-preference/ORDER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200
**Check structure:**

```json
{
  "preferenceId": string,
  "initPoint": string,
  "sandboxInitPoint": string
}
```

**Note:** Requiere MERCADOPAGO_ACCESS_TOKEN en .env

### [ ] GET `/api/payments/status/ORDER_ID`

```bash
curl http://localhost:3000/api/payments/status/ORDER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 200

```json
{
  "paymentStatus": string,
  "paymentId": string | null,
  "preferenceId": string | null,
  "status": string
}
```

---

## ❌ Error Cases to Test

### [ ] Unauthorized access (sin token)

```bash
curl http://localhost:3000/api/restaurants/me
```

**Expected:** Status 401 Unauthorized

### [ ] Wrong credentials

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@restaurant.com",
    "password": "WrongPassword"
  }'
```

**Expected:** Status 401 Unauthorized

### [ ] Invalid status transition

```bash
# Crear orden nueva (PENDING)
# Intentar cambiar directamente a DELIVERED (debe fallar)
curl -X PATCH http://localhost:3000/api/restaurants/RESTAURANT_ID/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DELIVERED"
  }'
```

**Expected:** Status 400 Bad Request
**Message:** "Cannot transition from PENDING to DELIVERED"

### [ ] Access other restaurant's data

```bash
# Con token de restaurant A, intentar acceder a restaurant B
curl http://localhost:3000/api/restaurants/OTHER_RESTAURANT_ID/orders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Status 403 Forbidden

---

## 📝 Final Checklist Summary

- [ ] Authentication (3 endpoints)
- [ ] Restaurants (2 endpoints)
- [ ] Categories (2 endpoints)
- [ ] Dishes (2 endpoints)
- [ ] Orders (5 endpoints) **CRITICAL**
- [ ] Stats (2 endpoints) **CRITICAL**
- [ ] Tables (3 endpoints)
- [ ] Payments (2 endpoints)
- [ ] Error handling (4 test cases)

**Total:** 21 checks + 4 error cases = 25 validations

---

## 🎯 Critical Path for Dashboard

**Minimum viable test sequence:**

1. ✅ Login → Get token
2. ✅ Create/Get restaurant → Get restaurant ID
3. ✅ Create category → Get category ID
4. ✅ Create dish → Get dish ID
5. ✅ Create order (public) → Get order ID
6. ✅ Get orders list
7. ✅ Update order status
8. ✅ Get today stats
9. ✅ Get top dishes

**If these 9 steps work, dashboard is ready! 🎉**

---

## 💡 Tips

- Save all IDs (token, restaurant, category, dish, order) en variables
- Usa Postman o Thunder Client para testing más fácil
- Revisa logs del servidor para debugging: `npm run start:dev`
- Los timestamps son en UTC
- Los precios son en centavos (1800 = $18.00)
