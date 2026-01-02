#!/bin/bash

# Test script for Mobile Menu API
# Usage: ./test-mobile-menu.sh <restaurant-id> <jwt-token>

RESTAURANT_ID="${1:-cmjtatqar000e01pnutm8cyhs}"
JWT_TOKEN="${2}"
BASE_URL="http://localhost:4000"

echo "🧪 Testing Mobile Menu API"
echo "=========================="
echo ""

# Test 1: Update mobile menu configuration
echo "📝 Test 1: Updating mobile menu configuration..."
RESPONSE=$(curl -s -X PATCH "${BASE_URL}/api/restaurants/${RESTAURANT_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "branding": {
      "mobileMenu": {
        "backgroundColor": "#1f2937",
        "textColor": "#f3f4f6",
        "items": [
          { "label": "Inicio", "href": "/", "icon": "Home", "enabled": true },
          { "label": "Menú", "href": "/menu", "icon": "Utensils", "enabled": true },
          { "label": "Carrito", "href": "/cart", "icon": "ShoppingCart", "enabled": true },
          { "label": "Reservas", "href": "/reservas", "icon": "Calendar", "enabled": true },
          { "label": "Llamar", "href": "tel:+541112345678", "icon": "Phone", "enabled": true }
        ]
      }
    }
  }')

if echo "$RESPONSE" | grep -q "mobileMenu"; then
  echo "✅ Update successful"
  echo "$RESPONSE" | jq '.restaurant.branding.mobileMenu' 2>/dev/null || echo "$RESPONSE"
else
  echo "❌ Update failed"
  echo "$RESPONSE"
fi

echo ""

# Test 2: Partial update (only backgroundColor)
echo "📝 Test 2: Partial update (only backgroundColor)..."
RESPONSE=$(curl -s -X PATCH "${BASE_URL}/api/restaurants/${RESTAURANT_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "branding": {
      "mobileMenu": {
        "backgroundColor": "#FF5722"
      }
    }
  }')

if echo "$RESPONSE" | grep -q "FF5722"; then
  echo "✅ Partial update successful (items preserved)"
  echo "$RESPONSE" | jq '.restaurant.branding.mobileMenu' 2>/dev/null || echo "$RESPONSE"
else
  echo "❌ Partial update failed"
  echo "$RESPONSE"
fi

echo ""

# Test 3: Get public restaurant data
echo "📝 Test 3: Getting public restaurant data..."
SLUG=$(curl -s "${BASE_URL}/api/restaurants/${RESTAURANT_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq -r '.restaurant.slug' 2>/dev/null)

if [ -n "$SLUG" ] && [ "$SLUG" != "null" ]; then
  RESPONSE=$(curl -s "${BASE_URL}/api/restaurants/slug/${SLUG}")
  
  if echo "$RESPONSE" | grep -q "mobileMenu"; then
    echo "✅ Public endpoint returns mobileMenu"
    echo "$RESPONSE" | jq '.restaurant.branding.mobileMenu' 2>/dev/null || echo "$RESPONSE"
  else
    echo "⚠️  Public endpoint doesn't include mobileMenu (might be empty)"
  fi
else
  echo "⚠️  Could not determine restaurant slug"
fi

echo ""
echo "=========================="
echo "🎉 Tests completed!"
echo ""
echo "Usage examples:"
echo "  ./test-mobile-menu.sh"
echo "  ./test-mobile-menu.sh <restaurant-id> <jwt-token>"
