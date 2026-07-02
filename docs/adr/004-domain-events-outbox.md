# ADR-004: Eventos de dominio vía outbox PostgreSQL

**Estado:** Aceptado — **Fase 0 implementada** (2026-07-02)  
**Decisores:** Engineering  
**Relacionado:** ADR-001, ADR-003, ADR-005

---

## Contexto

Hoy la integración Planner ↔ Tasks usa **callback circular**:

```
AiTaskRunnerService ──forwardRef──► PlanExecutorService.onTaskCompleted()
```

Problemas:
- Ciclo de dependencias Nest
- Imposible escalar consumidores (CI, Learning, Insights) sin acoplar
- Sin replay ni auditoría de eventos
- BullMQ opcional no unifica semántica

Pregunta abierta #8: ¿Event bus implementation?

Restricción: **sin infraestructura nueva** (no Kafka, no RabbitMQ dedicado).

---

## Decisión

Implementar **Transactional Outbox** en PostgreSQL existente, con dispatcher híbrido:

```
┌─────────────┐     same TX      ┌──────────────┐
│ Domain write│ ───────────────► │ DomainOutbox │
└─────────────┘                  └──────┬───────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
            OutboxPoller (cron 5s)                  BullMQ (si REDIS_URL)
                    │                                       │
                    └──────────────► In-process handlers ───┘
```

### Tabla `DomainOutbox`

```prisma
model DomainOutbox {
  id            String   @id @default(cuid())
  eventType     String   // e.g. TaskCompleted
  aggregateType String   // e.g. AiTask
  aggregateId   String
  payload       Json
  status        OutboxStatus @default(PENDING) // PENDING | PROCESSING | DONE | FAILED
  attempts      Int      @default(0)
  availableAt   DateTime @default(now())
  processedAt   DateTime?
  createdAt     DateTime @default(now())

  @@index([status, availableAt])
  @@index([eventType, createdAt])
}
```

### Publicación

Dentro de la misma transacción Prisma que muta el aggregate:

```typescript
await prisma.$transaction([
  prisma.aiTask.update(...),
  prisma.domainOutbox.create({ eventType: 'TaskCompleted', ... }),
]);
```

Helper: `OutboxPublisher.publish(tx, event)`.

### Consumo

- **`OutboxDispatcherService`**: cron cada 5s, batch 50, lock optimista (`status PROCESSING`).
- Si `REDIS_URL`: opcionalmente publicar a BullMQ queue `domain-events` para workers paralelos (reutiliza infra existente).
- Handlers registrados en `DomainEventHandlerRegistry` (patrón igual a `AiTaskRegistry`).

### Eventos MVP (Fase 0 — desacoplar Runner/Executor)

| Evento | Productor | Handler(s) inicial |
|--------|-----------|------------------|
| `TaskCompleted` | AiTaskRunner | PlanAdvanceHandler |
| `TaskFailed` | AiTaskRunner | PlanAdvanceHandler |
| `PlanApproved` | AiPlanner | PlanStartHandler |
| `LeadStatusChanged` | LeadsService | SensingIncrementalHandler (fase CI) |
| `AnalysisApproved` | LeadApprovalService | DecisionRefreshHandler (fase CI) |

### Eliminar forwardRef

Tras migrar `PlanExecutor.onTaskCompleted` a handler de `TaskCompleted`:
- Remover `@Inject(forwardRef(() => PlanExecutorService))` de `AiTaskRunnerService`.

---

## Consecuencias

### Positivas

- Sin infra nueva obligatoria (solo PostgreSQL).
- At-least-once delivery con idempotencia en handlers.
- CI puede suscribirse sin importar Planner.
- Replay posible para debugging (`reprocess outbox id`).
- Alineado con escala a 1M decisiones (partition/archivo después).

### Negativas

- Latencia ~5s vs callback síncrono (aceptable para plan advance).
- Handlers deben ser **idempotentes**.
- Tabla outbox crece — necesita job de archivo (>90 días → cold storage).

### Idempotencia

Cada handler recibe `eventId` (outbox id). Tabla `DomainEventProcessed(handlerKey, eventId)` o check en handler.

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|-------------|---------------------|
| In-process EventEmitter2 | Sin durabilidad; pierde eventos en crash |
| Solo BullMQ | Sin Redis en dev; no transaccional con DB write |
| Kafka / SNS | Infra nueva; overkill |
| Mantener forwardRef | Deuda confirmada; no escala |

---

## Implicaciones de implementación

### Orden

1. **Fase 0 (pre-CI):** Outbox + `TaskCompleted` + eliminar forwardRef.
2. **Fase CI:** Sensing/Decisioning handlers.

### No usar outbox para

- Cache invalidation efímera
- SSE push (derivar de read model poll)

### Monitoreo

- Alert si `PENDING` > 1000 o oldest > 5 min
- Métrica: `outbox_dispatch_lag_ms`

---

## Catálogo de eventos completo (target)

Ver auditoría §7. Implementación incremental; no crear todos en día 1.

Prioridad P0: `TaskCompleted`, `TaskFailed`, `PlanApproved`  
Prioridad P1: `LeadStatusChanged`, `AnalysisApproved`, `RecommendationGenerated`  
Prioridad P2: `BudgetThresholdReached`, `OpportunityDetected`, `DecisionAccepted`
