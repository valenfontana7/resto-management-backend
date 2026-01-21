// Script simple para probar notificaciones SSE de cocina
const { EventSource } = require('eventsource');

// Token JWT válido (del login)
const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWttNXN1bnQwMDA2MDFreXA0dHNjbmZpIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmNvbSIsInJvbGVJZCI6ImNta201c3VuaTAwMDEwMWt5MjdiZDNubXkiLCJyZXN0YXVyYW50SWQiOiJjbWttNXN1bjkwMDAwMDFreWd3cnM5OTZzIiwicm9sZU5hbWUiOiJBZG1pbiIsInJlc3RhdXJhbnRTbHVnIjoidGVzdC1yZXN0YXVyYW50IiwiaWF0IjoxNzY4ODg3Mjc4LCJleHAiOjE3Njk0OTIwNzh9.xkTJtxl5OqOfFfMFX4aH_dVD1QPfHGQBRpgQvFXf0hw';
const restaurantId = 'cmkm5sun9000001kygwrs996s';

const url = `http://localhost:4000/api/restaurants/${restaurantId}/kitchen/notifications?token=${token}`;

console.log('Conectando a:', url);

const eventSource = new EventSource(url);

eventSource.onopen = () => {
  console.log('✅ Conexión SSE establecida');
};

eventSource.onmessage = (event) => {
  console.log('📨 Notificación recibida:', event.data);
  try {
    const data = JSON.parse(event.data);
    console.log('📦 Datos parseados:', data);
  } catch (error) {
    console.error('❌ Error parseando datos:', error);
  }
};

eventSource.onerror = (error) => {
  console.error('❌ Error en SSE:', error);
};

eventSource.addEventListener('order_created', (event) => {
  console.log('🍽️  Nuevo pedido creado:', event.data);
});

eventSource.addEventListener('order_updated', (event) => {
  console.log('🔄 Pedido actualizado:', event.data);
});

eventSource.addEventListener('order_ready', (event) => {
  console.log('✅ Pedido listo:', event.data);
});

eventSource.addEventListener('order_cancelled', (event) => {
  console.log('❌ Pedido cancelado:', event.data);
});

// Mantener el script corriendo
setInterval(() => {
  console.log('⏰ Esperando notificaciones...');
}, 30000);
