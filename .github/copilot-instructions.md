# Bentoo AI Instructions

Bentoo es un SaaS gastronómico multi-tenant para restaurantes y cafeterías argentinos.

Multi-tenant: cada tabla relevante lleva `restaurantId`. Auth por JWT en cookie httpOnly. Todo query debe filtrar por el `restaurantId` del usuario autenticado; nunca exponer datos cross-tenant.

Stack:

- Frontend: Next.js 14 (App Router) + React 18 + TypeScript + Tailwind + shadcn/ui
- Backend: NestJS + Prisma + PostgreSQL
- Pagos: MercadoPago Checkout Pro. Validar webhooks por firma, idempotencia por `external_reference`, moneda ARS, credenciales sandbox/prod separadas por env vars.

Prioridades (ordenadas; ante conflicto prevalece el número más bajo):

1. simplicidad (menos código gana)
2. velocidad de desarrollo
3. UX mobile-first
4. onboarding rápido (<90s hasta web pública)
5. evitar sobreingeniería

Nunca:

- Agregar librerías nuevas salvo que reemplacen >50 líneas de código propio o resuelvan un problema de seguridad. Preferir soluciones nativas de Next/Nest/Prisma.
- Crear interfaces o clases abstractas, capas de servicio genéricas, ni wrappers sobre librerías. Usar funciones/servicios directos que llamen a la librería.
- Complicar la arquitectura agregando capas no pedidas.
- Aplicar Repository pattern manual sobre Prisma, contenedores de DI extra fuera de los módulos de Nest, Clean Architecture por capas, o base classes abstractas. Preferir módulos directos y servicios planos.

El producto apunta a:

- pequeños y medianos restaurantes argentinos
- negocios con poco tiempo
- usuarios no técnicos

El código debe:

- ser simple
- mantenible
- explícito
- consistente
- en español rioplatense (voseo) en todo copy visible al usuario
