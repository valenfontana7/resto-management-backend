# ADR-008: Deprecación de LeadsTaskOrchestratorService

**Estado:** Aceptado — implementado 2026-07-02  
**Fecha:** 2026-07-02  
**Decisores:** Engineering  
**Relacionado:** ADR-003, ADR-004, ADR-005

---

## Contexto

Existían dos runtimes para ejecutar AI Tasks de leads:

| Runtime | Ubicación | Rol |
|---------|-----------|-----|
| **Execution Platform** | `ai-platform/` | AiTaskRunner, Queue, Planner, outbox |
| **LeadsTaskOrchestratorService** | `leads/` | Wrapper legacy con polling inline y persistencia duplicada |

Problemas del orchestrator:

- Polling `waitForTask` duplicado fuera de la cola
- `LeadAnalysis` creado sin `aiTaskId` → imposible trazar task ↔ análisis
- Segundo camino de ejecución paralelo al Planner
- `LeadsAiService` marcado `@deprecated` pero apuntando al orchestrator (confuso)

---

## Decisión

1. **Eliminar** `LeadsTaskOrchestratorService`
2. **Reemplazar** por `LeadsAiExecutionService` — entry point ad-hoc sobre Execution Platform
3. **Extraer** `LeadAnalysisPersistenceService` — persistencia única de `LeadAnalysis` con `aiTaskId`
4. **Mover** `waitForCompletion` a `AiTaskQueueService` (reutilizable)
5. **`LeadsAiService`** permanece como fachada HTTP delgada sobre `LeadsAiExecutionService`

### Frontera de responsabilidades (post-deprecación)

```
Ad-hoc (LeadAiPanel, buscar, import)
  → LeadsAiExecutionService → AiTaskRunner / AiTaskQueue

Planes (objetivos comerciales)
  → GoalEngine → PlanExecutor → AiTaskRunner → outbox

Commercial Intelligence
  → recomienda → GoalEngine (L1)
```

---

## Consecuencias

### Positivas

- Un solo stack de ejecución (Execution Platform)
- Trazabilidad `LeadAnalysis.aiTaskId` en flujos ad-hoc
- Menos código duplicado (~210 líneas eliminadas)

### Negativas

- Ningún breaking change en API HTTP (`/api/super-admin/leads/*` intacta)
- Imports externos de `LeadsTaskOrchestratorService` deben migrar a `LeadsAiExecutionService` (solo export del módulo)

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|-------------|---------------------|
| Mantener orchestrator como alias | Confunde ownership; deuda perpetua |
| Mover todo al Planner | Overkill para acciones unitarias desde ficha de lead |
| Inline handlers sin AiTask | Pierde trazabilidad de costos y outbox |

---

## Implicaciones de implementación

- `AiTaskRunner.runInline` ahora retorna `taskId`
- `AiTaskQueueService.waitForCompletion(taskId, timeoutMs)` para discovery síncrono
- ADR-008 cierra el ítem #5 del handoff Commercial Intelligence
