# Commercial Intelligence + AI Planner — Handoff de contexto

> **Última actualización:** 2026-07-02  
> **Workspace:** `bentoo/` (dos repos git independientes bajo `resto/`)

---

## 1. Visión del plan

Evolución del módulo **Master → Leads** sin reemplazar la plataforma existente:

| Capa | Rol | Estado |
|------|-----|--------|
| **AI Tasks** | Unidades atómicas ejecutables (`leads.draft_message_whatsapp`, etc.) | Existente |
| **AI Planner** | Usuario define objetivos → compone planes dinámicos → ejecuta tasks | ✅ Implementado |
| **Commercial Intelligence (CI)** | Cerebro económico: EV, recomendaciones, dashboard "Hoy" | ✅ Fase 0 + Fase 1 MVP |
| **Opportunity Engine** | Detección proactiva de señales comerciales | ❌ No iniciado (Fase 2+) |

**Principio rector:** CI **recomienda**; Planner **ejecuta**. No agregar nuevas AI Tasks salvo necesidad explícita de producto.

---

## 2. ADRs (leer antes de extender)

Ubicación: `resto-management-backend/docs/adr/`

| ADR | Decisión clave |
|-----|----------------|
| 001 | Human-in-the-loop L0/L1 default; L2 auto solo con flags + umbrales |
| 002 | `expectedRevenueUsd` = valor suscripción Bentoo 12m (base USD 348), config-driven |
| 003 | Bounded context **Commercial Intelligence** (Sensing / Decisioning / Read models) |
| 004 | Domain events vía **PostgreSQL outbox** — implementado Fase 0 |
| 005 | `ModelSelectionPolicy` vive en **Execution Platform**; CI solo recomienda modelo |

---

## 3. Fases de implementación

### Fase 0 — ✅ Completada

**Domain Outbox (ADR-004):**
- Tablas: `DomainOutbox`, `DomainEventProcessed`, enum `OutboxStatus`
- Migración: `20260702194500_add_domain_outbox`
- Código: `src/ai-platform/events/*`
- `AiTaskRunnerService` publica `TaskCompleted`/`TaskFailed` → outbox
- Eliminado `forwardRef` Runner ↔ PlanExecutor
- Handlers: priority 10 `PlanLeadBindingService`, priority 20 `PlanExecutor.onTaskCompleted`

**Fix entityRef → leadId:**
- `src/leads/plan-lead-binding.service.ts` — tras `leads.discover_restaurants`, importa candidatos y mapea `entity-N` → `leadId` real
- `plan-composer.service.ts` — ya no setea `leadId: entityRef`
- `plan-executor.service.ts` — resuelve `leadId` real al crear `AiTask`

### AI Planner — ✅ Completada (fase anterior)

- Schema: `AiGoal`, `ExecutionPlan`, `ExecutionPlanStep`, `AiPlannerEvent`, `AiInsight`
- Migración: `20260702193000_add_ai_planner`
- Backend: `src/ai-platform/planner/`, `src/ai-platform/goal-engine/`
- API: `/api/super-admin/ai/planner/*`
- Frontend: `/master/leads/objetivos`, `CreateGoalDialog`, `AiGoalCard`, `AiPlanPreviewPanel`

### Fase 1 — ✅ MVP completado (2026-07-02)

**Schema + migración:**
- `CommercialIntelligenceConfig`, `CommercialDecision`
- Migración: `20260702200000_add_commercial_intelligence`

**Backend** (`src/commercial-intelligence/`):
- `config/commercial-config.service.ts` — seed config default on init
- `catalog/action-catalog.service.ts` — mapeo lead status → acción
- `pricing/action-cost-estimator.service.ts` — costo estimado (cache/histórico/pricing)
- `decisioning/expected-value-engine.service.ts` — EV, ROI, verdict
- `decisioning/commercial-today.service.ts` — dashboard + preview + simulateModels
- `commercial-intelligence.controller.ts`
- `commercial-intelligence.module.ts` — registrado en `app.module.ts`

**Execution Platform:**
- `src/ai-platform/pricing/model-selection-policy.service.ts` (ADR-005)
- `ModelSelectorService` delega a policy
- `PlannerMemoryService` exportado desde `AiPlatformModule`

**API CI:**
```
GET  /api/super-admin/commercial-intelligence/today
GET  /api/super-admin/commercial-intelligence/leads/:id/preview
POST /api/super-admin/commercial-intelligence/leads/:id/simulate
GET  /api/super-admin/commercial-intelligence/decisions
POST /api/super-admin/commercial-intelligence/recommendations/act
```

**Frontend:**
- `/master/leads/hoy` — tab "Hoy" en `LeadsSubNav`
- `src/types/commercial-intelligence.ts`
- `src/lib/api/services/commercial-intelligence.service.ts`
- `src/components/master/leads/CommercialTodayDashboard.tsx`
- Flujo L1: botón "Hacerlo" → `actOnRecommendation(createGoal: true)` → redirige a objetivo

**Verificado:** `npm run build` (backend) + `tsc --noEmit` (frontend)

### Fase 2+ — Pendiente

1. **Sensing / Opportunity Engine** — señales proactivas (no solo evaluación batch de leads)
2. **UI simulador de modelos** — endpoint `simulate` existe; falta UI en prospecto/lead detail
3. **Learning de desviaciones** — comparar `CommercialDecision` vs outcome real
4. **Reanudar plan tras approval** — workflow de aprobación no reanuda plan al aprobar mensaje/demo
5. **L2 auto-ejecutar** — flags en config + guardrails ADR-001
6. **ADR-006..008** — feed unificado, multi-tenant AI, deprecar `LeadsTaskOrchestratorService`

---

## 4. Arquitectura de flujo (actual)

```
Usuario → /master/leads/hoy
    ↓
CommercialTodayService (evalúa ~40 leads activos)
    ↓
ExpectedValueEngine + ActionCatalog + ActionCostEstimator
    ↓
ActionIntelligenceResult (verdict: DO_NOW | GENERATE_DEMO | WAIT | ...)
    ↓
[L1] POST recommendations/act { createGoal: true }
    ↓
GoalEngine.create → AiPlanner.buildPlan
    ↓
Usuario revisa plan en /master/leads/objetivos/:id → approve → execute
    ↓
PlanExecutor → AiTaskRunner → outbox TaskCompleted → handlers
```

---

## 5. Deuda técnica conocida

- **Dos runtimes:** `LeadsTaskOrchestratorService` (legacy) vs Planner — unificar o deprecar
- **Approval gap:** aprobar mensaje/demo no reanuda el plan en curso
- **`AiGoal.estimatedRoi`** se setea desde confidence del plan (naming confuso)
- **`TASK_CAPABILITIES`** tiene costos hardcoded en registry; pesos EV sí van en `CommercialIntelligenceConfig` (DB)
- **Sin multi-tenant** en AI platform (`scope: 'global'`)
- **Simulate UI** no expuesta; backend `simulateModels` funciona con `preferredModel` por escenario
- **Preview por lead** no integrado en ficha de prospecto (solo dashboard agregado)

---

## 6. Archivos clave

### Backend
```
src/ai-platform/
  planner/          # PlanComposer, PlanExecutor, ModelSelector
  goal-engine/      # GoalEngineService
  events/           # Outbox publisher/dispatcher
  pricing/          # ModelSelectionPolicyService

src/commercial-intelligence/
  decisioning/      # ExpectedValueEngine, CommercialTodayService
  catalog/          # ActionCatalogService
  config/           # CommercialConfigService + DEFAULT_CI_CONFIG

src/leads/
  plan-lead-binding.service.ts

prisma/migrations/
  20260702193000_add_ai_planner/
  20260702194500_add_domain_outbox/
  20260702200000_add_commercial_intelligence/
```

### Frontend
```
src/app/master/leads/hoy/page.tsx
src/app/master/leads/objetivos/
src/components/master/leads/CommercialTodayDashboard.tsx
src/components/master/leads/LeadsSubNav.tsx
src/lib/api/services/commercial-intelligence.service.ts
src/types/commercial-intelligence.ts
```

---

## 7. Setup local

```bash
# Backend (puerto 4000 en proxy frontend)
cd resto-management-backend
npx prisma generate && npx prisma migrate deploy
npm run start:dev

# Frontend (puerto 3000)
cd resto-management-system
npm run dev
```

**Env críticas:** `DATABASE_URL`, `JWT_SECRET`, `BACKEND_API_ORIGIN=http://localhost:4000` (frontend)

**Probar:** login SUPER_ADMIN → `/master/leads/hoy` → ver recomendaciones → "Hacerlo (L1)"

---

## 8. Convenciones al continuar

- No commitear salvo que el usuario lo pida
- Respuestas en español
- CI recomienda; no auto-ejecutar tasks directamente (excepto L2 futuro con flags)
- Usar `OwnershipService` + decoradores en backend; multi-tenant por `restaurantId` donde aplique
- Servicios frontend nuevos en `lib/api/services/`; tipos en `src/types/`
- CodeGraph MCP disponible para preguntas estructurales (`codegraph_*`)

---

## 9. Prompt para continuar en otro dispositivo

Copiar y pegar en un chat nuevo de Cursor:

```
Contexto: proyecto Bentoo (SaaS multi-tenant restaurantes). Workspace en bentoo/ con dos repos:
- resto-management-system/ (Next.js 16, puerto 3000)
- resto-management-backend/ (NestJS 11 + Prisma 7, puerto 4000)

Estoy implementando Commercial Intelligence (CI) sobre AI Planner + AI Tasks en Master → Leads.

LEER PRIMERO:
- resto-management-backend/docs/COMMERCIAL_INTELLIGENCE_HANDOFF.md (este handoff)
- resto-management-backend/docs/adr/README.md (ADRs 001-005)

YA IMPLEMENTADO:
- Fase 0: Domain outbox PostgreSQL + fix entityRef→leadId en plan-lead-binding
- AI Planner completo (objetivos, planes, timeline, UI /master/leads/objetivos)
- Fase 1 CI MVP: ExpectedValueEngine, dashboard "Hoy" (/master/leads/hoy), API /api/super-admin/commercial-intelligence/*, ModelSelectionPolicy en ai-platform/pricing, migración 20260702200000_add_commercial_intelligence aplicada, build OK

RESTRICCIONES:
- NO reemplazar Planner/Goal Engine/AI Tasks existentes
- NO agregar nuevas AI Tasks sin pedido explícito
- CI solo recomienda; ejecución vía Planner (L1 human-in-the-loop por default)
- No commitear salvo que lo pida

PRÓXIMO TRABAJO SUGERIDO (elegir según prioridad):
1. Integrar preview CI en ficha de prospecto (/master/leads/prospectos/[id]) + UI simulador de modelos
2. Reanudar plan tras aprobar mensaje/demo en approval workflow
3. Fase 2 Sensing: Opportunity signals + feed proactivo
4. Learning: comparar CommercialDecision vs outcomes reales
5. Deprecar LeadsTaskOrchestratorService (ADR-008)

Comandos útiles:
cd resto-management-backend && npx prisma migrate deploy && npm run build
cd resto-management-system && npx tsc --noEmit

[Tu tarea específica aquí — ej: "Implementá el preview CI en la ficha de prospecto con botón simular modelos"]
```

---

## 10. Historial de chat

Transcript completo de la sesión de diseño/implementación:
`~/.cursor/projects/c-Users-valen-Desktop-Valen-Proyectos-bentoo/agent-transcripts/a7e9c084-20e3-44c7-8cdc-66ab701857eb/a7e9c084-20e3-44c7-8cdc-66ab701857eb.jsonl`
