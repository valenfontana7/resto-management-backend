# Commercial Intelligence + AI Planner — Handoff de contexto

> **Última actualización:** 2026-07-02 (post Fase 2 + post-handoff items)  
> **Workspace:** `bentoo/` (dos repos git independientes bajo `resto/`)

---

## 1. Visión del plan

Evolución del módulo **Master → Leads** sin reemplazar la plataforma existente:

| Capa | Rol | Estado |
|------|-----|--------|
| **AI Tasks** | Unidades atómicas ejecutables (`leads.draft_message_whatsapp`, etc.) | ✅ Execution Platform unificada |
| **AI Planner** | Usuario define objetivos → compone planes dinámicos → ejecuta tasks | ✅ Implementado |
| **Commercial Intelligence (CI)** | Cerebro económico: EV, recomendaciones, dashboard "Hoy" | ✅ Fase 0 + Fase 1 + Fase 2 MVP |
| **Opportunity Engine (Sensing)** | Detección proactiva de señales comerciales | ✅ MVP (7 tipos de señal + feed) |
| **Learning** | Comparar predicciones vs outcomes reales | ✅ MVP (read-model on-the-fly) |

**Principio rector:** CI **recomienda**; Planner **ejecuta**. No agregar nuevas AI Tasks salvo necesidad explícita de producto.

---

## 2. ADRs (leer antes de extender)

Ubicación: `resto-management-backend/docs/adr/`

| ADR | Decisión clave | Estado |
|-----|----------------|--------|
| 001 | Human-in-the-loop L0/L1 default; L2 auto solo con flags + umbrales | Aceptado |
| 002 | `expectedRevenueUsd` = valor suscripción Bentoo 12m (base USD 348), config-driven | Aceptado |
| 003 | Bounded context **Commercial Intelligence** (Sensing / Decisioning / Read models) | Aceptado |
| 004 | Domain events vía **PostgreSQL outbox** | **Implementado** |
| 005 | `ModelSelectionPolicy` vive en **Execution Platform**; CI solo recomienda modelo | Aceptado |
| 008 | Deprecación de `LeadsTaskOrchestratorService` → `LeadsAiExecutionService` | **Implementado** |

---

## 3. Fases de implementación

### Fase 0 — ✅ Completada

**Domain Outbox (ADR-004):**
- Tablas: `DomainOutbox`, `DomainEventProcessed`, enum `OutboxStatus`
- Migración: `20260702194500_add_domain_outbox`
- Código: `src/ai-platform/events/*`
- `AiTaskRunnerService` publica `TaskCompleted`/`TaskFailed` → outbox
- Handlers: priority 10 `PlanLeadBindingService`, priority 20 `PlanExecutor.onTaskCompleted`, priority 25 `TaskApprovalArtifactHandler`

**Fix entityRef → leadId:**
- `src/leads/plan-lead-binding.service.ts`
- `plan-composer.service.ts`, `plan-executor.service.ts`

### AI Planner — ✅ Completada

- Schema: `AiGoal`, `ExecutionPlan`, `ExecutionPlanStep`, `AiPlannerEvent`, `AiInsight`
- Migración: `20260702193000_add_ai_planner`
- Backend: `src/ai-platform/planner/`, `src/ai-platform/goal-engine/`
- API: `/api/super-admin/ai/planner/*`
- Frontend: `/master/leads/objetivos`, `CreateGoalDialog`, `AiGoalCard`, `AiPlanPreviewPanel`

### Fase 1 — ✅ MVP completado

**Schema + migración:**
- `CommercialIntelligenceConfig`, `CommercialDecision`
- Migración: `20260702200000_add_commercial_intelligence`

**Backend** (`src/commercial-intelligence/`):
- `config/` — `CommercialConfigService` + `DEFAULT_CI_CONFIG`
- `catalog/` — `ActionCatalogService`
- `pricing/` — `ActionCostEstimatorService`
- `decisioning/` — `ExpectedValueEngineService`, `CommercialTodayService`

**API CI (Decisioning):**
```
GET  /api/super-admin/commercial-intelligence/today
GET  /api/super-admin/commercial-intelligence/leads/:id/preview
POST /api/super-admin/commercial-intelligence/leads/:id/simulate
GET  /api/super-admin/commercial-intelligence/decisions
POST /api/super-admin/commercial-intelligence/recommendations/act
```

**Frontend Fase 1:**
- `/master/leads/hoy` — `CommercialTodayDashboard`
- Flujo L1: "Hacerlo" → `actOnRecommendation(createGoal: true)` → `/master/leads/objetivos/:id`

### Post-Fase 1 — ✅ Completado (2026-07-02, misma sesión)

#### 1. Preview CI en ficha de prospecto + simulador de modelos
- **Frontend:** `LeadCommercialPreviewPanel` en `/master/leads/prospectos/[id]` (sidebar)
- Métricas EV, alternativas, "Hacerlo (L1)", botón **Simular modelos**
- **Servicio:** `simulateModels(leadId, taskKey)` → endpoint existente

#### 2. Reanudar plan tras approval workflow
- **`PlanApprovalBridgeService`** — crea `LeadAnalysis` con `aiTaskId`, reanuda plan al aprobar
- **`TaskApprovalArtifactHandler`** (outbox priority 25) — artefacto de aprobación automático
- **`LeadApprovalService`** — `approve`/`reject` llaman al bridge si hay `aiTaskId`
- **Frontend:** badge "Del plan" en `LeadApprovalsPanel`; soporte demo/propuesta vía `_taskKey`

#### 3. Fase 2 Sensing — Opportunity Engine MVP
- **`OpportunitySensorService`** — 7 señales: `STALE_FOLLOWUP`, `HIGH_INTENT_COOLING`, `HOT_NEW_LEAD`, `PENDING_APPROVAL`, `PLAN_AWAITING_APPROVAL`, `DEMO_CANDIDATE`, `BUDGET_LOW`
- **`OpportunityFeedService`** — read model agregado
- **API:** `GET /api/super-admin/commercial-intelligence/opportunities/feed`
- **Frontend:** `CommercialOpportunityFeed` en `/master/leads` (Inicio) y `/master/leads/hoy`

#### 4. Learning — predicción vs realidad
- **`CommercialLearningService`** — compara `CommercialDecision` vs costo real (`AiTaskExecution`) y outcome del lead (`LeadStatusChange`)
- Outcomes: `converted` | `progressed` | `stalled` | `lost` | `pending` | `unknown`
- Score de precisión 0–1 (outcome + desvío costo + delta ROI)
- **API:** `GET /api/super-admin/commercial-intelligence/learning/summary`
- **Frontend:** `CommercialLearningPanel` en dashboard Hoy

#### 5. Deprecación LeadsTaskOrchestratorService (ADR-008)
- **Eliminado:** `leads-task-orchestrator.service.ts`
- **Nuevo:** `LeadsAiExecutionService` + `LeadAnalysisPersistenceService`
- **`AiTaskRunner.runInline`** retorna `taskId`
- **`AiTaskQueueService.waitForCompletion`** — polling reutilizable
- **`LeadAnalysis`** ad-hoc ahora persiste `aiTaskId` + `_taskKey`

### Fase 3+ — Pendiente

1. **L2 auto-ejecutar** — flags en config + guardrails ADR-001
2. **ADR-006** — feed unificado (Hoy + señales + aprobaciones en una bandeja)
3. **ADR-007** — `workspaceId` en AI platform (multi-tenant)
4. **Learning persistido** — campos `actualCostUsd` / `outcomeStatus` en `CommercialDecision` (hoy es read-model on-the-fly)
5. **Señales reactivas** — emitir desde outbox (status change, task failed) en lugar de solo batch scan
6. **PDF factura / split equitativo** — pendientes de salón (fuera de CI)

---

## 4. Arquitectura de flujo (actual)

### Recomendación comercial (L1)

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
PlanExecutor → AiTaskRunner → outbox TaskCompleted
    ↓
Handlers: PlanLeadBinding (10) → PlanExecutor (20) → ApprovalArtifact (25)
```

### Aprobación human-in-the-loop

```
Task requiresApproval → AWAITING_APPROVAL
    ↓
TaskApprovalArtifactHandler → LeadAnalysis (PENDING_REVIEW, aiTaskId)
    ↓
Usuario aprueba en /master/leads/aprobaciones
    ↓
PlanApprovalBridge.resumePlanAfterApproval → step COMPLETED → advancePlan()
```

### Sensing proactivo

```
OpportunitySensorService (scan DB on-demand)
    ↓
7 tipos de señales priorizadas
    ↓
OpportunityFeedService → GET /opportunities/feed
    ↓
UI: /master/leads (Inicio) + /master/leads/hoy
```

### Ejecución ad-hoc (fuera del Planner)

```
LeadAiPanel / buscar / import
    ↓
LeadsAiService → LeadsAiExecutionService
    ↓
AiTaskRunner.runInline / AiTaskQueue.enqueue
    ↓
LeadAnalysisPersistenceService (aiTaskId vinculado)
```

---

## 5. Deuda técnica conocida

- **`AiGoal.estimatedRoi`** se setea desde confidence del plan (naming confuso)
- **`TASK_CAPABILITIES`** tiene costos hardcoded en registry; pesos EV sí van en `CommercialIntelligenceConfig` (DB)
- **Sin multi-tenant** en AI platform (`scope: 'global'`)
- **Learning on-the-fly** — no persiste outcomes en `CommercialDecision`; recalcula en cada request
- **Sensing batch** — no hay tabla `OpportunitySignal` ni emisión reactiva vía outbox
- **Señales duplicadas** — mismo lead puede aparecer en Hoy (EV) y en feed (señal); ADR-006 unificaría UX

### Resuelto en esta sesión ✅

- ~~Dos runtimes (Orchestrator vs Planner)~~ → ADR-008
- ~~Approval gap (plan no reanudaba)~~ → PlanApprovalBridge
- ~~Simulate UI no expuesta~~ → LeadCommercialPreviewPanel
- ~~Preview por lead no integrado~~ → sidebar en prospecto
- ~~Opportunity Engine no iniciado~~ → Fase 2 Sensing MVP
- ~~Learning no iniciado~~ → CommercialLearningService MVP

---

## 6. Archivos clave

### Backend — Commercial Intelligence

```
src/commercial-intelligence/
  config/commercial-config.service.ts
  catalog/action-catalog.service.ts
  pricing/action-cost-estimator.service.ts
  decisioning/
    expected-value-engine.service.ts
    commercial-today.service.ts      # today, preview, simulate, decisions
  sensing/opportunity-sensor.service.ts
  read-models/
    opportunity-feed.service.ts
    commercial-learning.service.ts
  types/commercial-intelligence.types.ts
  commercial-intelligence.controller.ts
  commercial-intelligence.module.ts
```

### Backend — Execution Platform + Leads

```
src/ai-platform/
  planner/
    plan-executor.service.ts
    plan-approval-bridge.service.ts   # approval → resume plan
  events/handlers/
    task-completed-plan.handler.ts    # priority 20
    task-approval-artifact.handler.ts  # priority 25
  queue/ai-task-queue.service.ts    # + waitForCompletion()
  tasks/ai-task-runner.service.ts     # runInline retorna taskId
  pricing/model-selection-policy.service.ts

src/leads/
  leads-ai-execution.service.ts       # reemplaza orchestrator (ADR-008)
  lead-analysis-persistence.service.ts
  leads-ai.service.ts                 # fachada HTTP
  plan-lead-binding.service.ts
  approval/lead-approval.service.ts
```

### Backend — Migraciones

```
prisma/migrations/
  20260702193000_add_ai_planner/
  20260702194500_add_domain_outbox/
  20260702200000_add_commercial_intelligence/
```

### Frontend

```
src/app/master/leads/
  hoy/page.tsx
  page.tsx                          # Inicio + CommercialOpportunityFeed
  prospectos/[id]/page.tsx          # + LeadCommercialPreviewPanel

src/components/master/leads/
  CommercialTodayDashboard.tsx
  CommercialOpportunityFeed.tsx
  CommercialLearningPanel.tsx
  LeadCommercialPreviewPanel.tsx
  LeadApprovalsPanel.tsx            # badge "Del plan"
  AiTaskCard.tsx                    # _taskKey, demo/proposal

src/lib/api/services/commercial-intelligence.service.ts
src/types/commercial-intelligence.ts
```

### API CI completa

```
GET  /api/super-admin/commercial-intelligence/today
GET  /api/super-admin/commercial-intelligence/leads/:id/preview
POST /api/super-admin/commercial-intelligence/leads/:id/simulate
GET  /api/super-admin/commercial-intelligence/decisions
POST /api/super-admin/commercial-intelligence/recommendations/act
GET  /api/super-admin/commercial-intelligence/opportunities/feed
GET  /api/super-admin/commercial-intelligence/learning/summary
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

**Probar flujo completo:**
1. Login SUPER_ADMIN → `/master/leads/hoy` → recomendaciones → "Hacerlo (L1)"
2. `/master/leads/objetivos/:id` → aprobar plan → ejecutar → paso con approval
3. `/master/leads/aprobaciones` → aprobar → plan continúa
4. `/master/leads/prospectos/:id` → panel CI + simular modelos
5. `/master/leads` → feed de oportunidades
6. `/master/leads/hoy` → sección Aprendizaje (requiere decisiones previas via L1)

**Verificar builds:**
```bash
cd resto-management-backend && npm run build
cd resto-management-system && npx tsc --noEmit
```

---

## 8. Convenciones al continuar

- No commitear salvo que el usuario lo pida
- Respuestas en español
- CI recomienda; no auto-ejecutar tasks directamente (excepto L2 futuro con flags)
- Ad-hoc lead AI → `LeadsAiExecutionService`; planes → `PlanExecutor`; no revivir orchestrator
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
- resto-management-backend/docs/adr/README.md (ADRs 001-005, 008)

YA IMPLEMENTADO (2026-07-02):
- Fase 0: Domain outbox + fix entityRef→leadId
- AI Planner completo (/master/leads/objetivos)
- Fase 1 CI: ExpectedValueEngine, dashboard Hoy, API CI, ModelSelectionPolicy
- Preview CI + simulador en ficha prospecto (LeadCommercialPreviewPanel)
- Approval bridge: plan reanuda tras aprobar mensaje/demo (PlanApprovalBridgeService)
- Fase 2 Sensing: 7 señales + feed proactivo (CommercialOpportunityFeed)
- Learning MVP: CommercialDecision vs outcomes (CommercialLearningPanel)
- ADR-008: LeadsTaskOrchestratorService eliminado → LeadsAiExecutionService

RESTRICCIONES:
- NO reemplazar Planner/Goal Engine/AI Tasks existentes
- NO agregar nuevas AI Tasks sin pedido explícito
- CI solo recomienda; ejecución vía Planner (L1) o LeadsAiExecutionService (ad-hoc)
- No commitear salvo que lo pida

PRÓXIMO TRABAJO SUGERIDO:
1. L2 auto-ejecutar con flags + guardrails ADR-001
2. ADR-006: feed unificado (Hoy + señales + aprobaciones)
3. ADR-007: multi-tenant AI (workspaceId)
4. Persistir outcomes en CommercialDecision (Learning v2)
5. Sensing reactivo vía outbox (event-driven signals)

Comandos útiles:
cd resto-management-backend && npx prisma migrate deploy && npm run build
cd resto-management-system && npx tsc --noEmit

[Tu tarea específica aquí]
```

---

## 10. Historial de chat

| Sesión | Transcript | Alcance |
|--------|------------|---------|
| Diseño + Fase 0/1 | `~/.cursor/.../a7e9c084-20e3-44c7-8cdc-66ab701857eb.jsonl` | Outbox, Planner, CI MVP |
| Post-handoff | Sesión Cursor 2026-07-02 | Items #1–#5 del handoff original |
