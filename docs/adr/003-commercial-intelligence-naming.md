# ADR-003: Bounded context — Commercial Intelligence

**Estado:** Aceptado  
**Fecha:** 2026-07-02  
**Decisores:** Engineering  
**Relacionado:** ADR-001, ADR-002, ADR-004, ADR-005

---

## Contexto

El diseño propuso dos capas:
- **Opportunity Engine** — detectar oportunidades
- **Revenue Intelligence Engine** — decisiones económicas

La auditoría identificó:
- “Revenue” confunde con revenue de restaurantes (producto tenant)
- Dos “engines” hermanos duplican APIs y recomendaciones
- Goal Engine, Insights, ROI ya mezclan responsabilidades con Planner

Pregunta abierta #5: ¿Renombrar Revenue Intelligence?

---

## Decisión

### Nombre del bounded context

**Commercial Intelligence** (abreviatura interna: **CI**)

Ruta de código propuesta:
```
src/commercial-intelligence/
  sensing/          # subdominio: oportunidades y señales
  decisioning/      # subdominio: EV, recomendaciones, simulador
  read-models/      # proyecciones: feed, dashboard, decisions
  config/
  commercial-intelligence.module.ts
```

### Subdominios (no “engines” separados)

| Subdominio | Nombre público UX | Responsabilidad |
|------------|-------------------|-----------------|
| **Sensing** | “Oportunidades” | Señales, clusters, Priority Index |
| **Decisioning** | “Recomendaciones” | EV, verdict, simulator, decision log |
| **Read models** | “Hoy” / Dashboard | Proyecciones para UI |

**No** existen módulos Nest llamados `OpportunityEngineModule` ni `RevenueIntelligenceModule`.

### Execution Platform (contexto separado, existente)

Permanece en `src/ai-platform/`:
- AI Tasks, Queue, Cost Engine, Memory, Providers
- Goal Engine + Planner + Plan Executor

CI **consume** Execution Platform vía commands y events. No vive dentro de `ai-platform/`.

### Ubicación de componentes mal ubicados hoy (refactor planificado)

| Componente actual | Destino |
|-------------------|---------|
| `RoiCalculatorService` en `planner/ai-insights` | `commercial-intelligence/read-models/` o `ai-platform/measurement/` |
| `AiInsightsService` (comercial) | CI read-models; insights de costo puro quedan en Cost Engine |
| `GoalStrategyRegistry` | Permanece en Planner (Execution), CI solo sugiere `goalType` + payload |

### API namespace

```
/api/super-admin/commercial-intelligence/
  today              # feed unificado
  opportunities/
  recommendations/
  decisions/
  simulate/
  config/
```

Deprecar progresivamente rutas `/ai/planner/` solo para lifecycle de goals/plans (Execution).

---

## Consecuencias

### Positivas

- Lenguaje alineado con GTM de Bentoo, no con finanzas del restaurante.
- Un solo ownership de producto (“Commercial Intelligence”).
- Evita proliferación de controllers paralelos.

### Negativas

- Rename conceptual; docs y conversaciones previas usaban “Revenue Intelligence”.
- Requiere mover carpetas (refactor mecánico).

### Glosario oficial

| Término | Significado |
|---------|-------------|
| Commercial Intelligence | Bounded context completo |
| Sensing | Detección de oportunidades |
| Decisioning | Evaluación EV y recomendación |
| Execution Platform | Tasks + Planner (sin decisiones comerciales) |
| Action | Intención comercial (VO), no necesariamente AI Task |

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|-------------|---------------------|
| Mantener “Revenue Intelligence” | Ambiguo en multi-producto SaaS |
| “GTM Intelligence” | Jerga anglosajona; menos claro para equipo AR |
| Dos engines separados | Duplicación validada en auditoría |
| Todo dentro de `ai-platform/` | Mezcla infra genérica con dominio comercial Bentoo |

---

## Implicaciones de implementación

1. Documentación: actualizar `AI_PLATFORM.md` con frontera CI ↔ Execution.
2. Frontend: tab **“Hoy”** bajo `/master/leads/hoy`, no “Revenue Dashboard”.
3. Prisma: prefijo `Commercial*` para nuevas tablas (`CommercialDecision`, `CommercialIntelligenceConfig`).
