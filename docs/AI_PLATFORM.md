# AI Platform (Bentoo)

Módulo transversal de tareas IA efímeras para Master Leads.

## Decisiones de arquitectura

Commercial Intelligence (capa superior) y su relación con Execution Platform están documentadas en [`docs/adr/`](./adr/README.md).

## Eventos de dominio (Outbox)

Patrón **Transactional Outbox** (`DomainOutbox`) — ver [ADR-004](./adr/004-domain-events-outbox.md).

- `TaskCompleted` / `TaskFailed` → handlers registrados vía `DomainEventHandlerRegistry`
- Plan advance: `TaskCompletedPlanHandler` (priority 20)
- Lead binding post-discovery: `PlanLeadBindingService` en LeadsModule (priority 10)
- Dispatcher: cron 5s + `dispatchOne()` inmediato tras publicar

## Componentes

- `AiPlatformModule` — providers, cost engine, cola híbrida, API super-admin
- `AiTaskRegistry` — registro extensible de handlers por `taskKey`
- `AiTaskRunnerService` — ejecución efímera + persistencia en `AiTaskExecution`
- `CostEngineService` — pricing desde DB (`AiModelPricing`), sin hardcode en runtime

## Cola

- Con `REDIS_URL`: BullMQ queue `ai-tasks`
- Sin Redis: polling DB cada 30s (`AiTaskDbPollerService`)

## Leads

Tareas registradas en `LeadsTasksRegistrar`. Endpoints legacy en `LeadsController` delegan a `LeadsTaskOrchestratorService`.

## Env

- `LEADS_AI_TASKS_ENABLED=false` — desactiva cola en discovery (fallback inline)
- Pricing y presupuestos: tablas `AiModelPricing`, `AiCostBudget` + API `/api/super-admin/ai/pricing|budgets`
