# ADR-006: Bandeja comercial unificada (Work Queue)

**Estado:** Aceptado  
**Fecha:** 2026-07-02  
**Relacionado:** ADR-001, ADR-003

---

## Contexto

Commercial Intelligence expone hoy múltiples superficies:

- Dashboard **Hoy** (recomendaciones EV)
- **Feed de oportunidades** (7 señales batch)
- **Aprobaciones** (mensajes/demos)
- **Objetivos** (planes pendientes)

El operador comercial salta entre pestañas y ve duplicados (mismo lead en Hoy y en señales).

---

## Decisión

Unificar en **`CommercialWorkQueueService`** + endpoint `GET /work-queue`:

1. Agregar recomendaciones accionables, señales, aprobaciones y planes pendientes
2. **Deduplicar por `leadId`** mergeando fuentes (`ev`, `signal`, `approval`, `plan`)
3. Ordenar por `priority` unificado
4. Exponer **acciones inline** por ítem (`express`, `l1`, `review`, `view`)
5. UI principal en `/master/leads/hoy` como **Bandeja de hoy**

Inicio (`/master/leads`) mantiene preview compacto del feed con link a bandeja completa.

---

## Consecuencias

- Menos context switching para prospección diaria
- Backend sigue manteniendo endpoints legacy (`/today`, `/opportunities/feed`) para compatibilidad
- Dismiss opcional in-memory (MVP) — no persiste entre reinicios

---

## Alternativas descartadas

- Reemplazar `/today` por work-queue únicamente → rompe integraciones recientes
- Tabla `WorkQueueItem` persistida → over-engineering para MVP
