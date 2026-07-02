# ADR-005: Ownership de selección de modelo IA

**Estado:** Aceptado  
**Fecha:** 2026-07-02  
**Decisores:** Engineering  
**Relacionado:** ADR-001, ADR-003, ADR-004

---

## Contexto

Hoy **tres lugares** pueden influir en el modelo:

| Ubicación | Lógica |
|-----------|--------|
| `ModelSelectorService` (Planner) | Presupuesto restante → flash-lite vs flash |
| `CostOptimizerService` (Planner) | Downgrade si budget apretado |
| Task handler `defaultModel` | Env `LEADS_AI_MODEL` |
| `AiTaskRunner` | Usa model del handler si step no tiene `selectedModel` |

El diseño de Commercial Intelligence propone:
- Decisioning recomienda “Usar Flash” / “Usar Pro”
- Simulator compara modelos por EV

Pregunta abierta #9: ¿Quién selecciona modelo post-Revenue?

Riesgo: CI elige Flash, Planner elige Pro, Runner usa env — **tres verdades**.

---

## Decisión

### Separación de responsabilidades

| Capa | Rol en selección de modelo |
|------|----------------------------|
| **Commercial Intelligence (Decisioning)** | Recomienda modelo **económicamente óptimo** como parte de `ActionIntelligence`. No ejecuta. |
| **Execution Platform — Plan Composer** | Persiste `selectedModel` en `ExecutionPlanStep` al construir plan. |
| **Execution Platform — Task Runner** | **Obligatorio:** usa `task.selectedModel` si existe; si no, fallback a policy default. |

### Servicio compartido: `ModelSelectionPolicy`

Nuevo servicio en **Execution Platform** (no en CI):

```
src/ai-platform/pricing/model-selection-policy.service.ts
```

```typescript
interface ModelSelectionInput {
  taskKey: string
  context: 'plan_compose' | 'recommendation_preview' | 'task_execute'
  budgetRemainingUsd?: number
  preferredModel?: string      // override humano
  recommendedModel?: string      // from CI decision snapshot
}

interface ModelSelectionResult {
  model: string
  source: 'override' | 'ci_snapshot' | 'budget_policy' | 'task_default'
  estimatedCostUsd: number
}
```

### Reglas de precedencia (determinísticas)

1. **`preferredModel`** — usuario editó en plan preview → gana siempre
2. **`recommendedModel`** — snapshot de `CommercialDecision` al actuar recomendación
3. **`budget_policy`** — lógica actual de `ModelSelectorService` (migrada aquí)
4. **`task_default`** — registry + env

CI **nunca** llama al provider. Solo calcula recomendación usando `ActionCostProjection` (mismos inputs que policy).

### Deprecación

- `ModelSelectorService` → thin wrapper sobre `ModelSelectionPolicy` (compat)
- `CostOptimizerService` → solo marca skip/reuse; **no** cambia modelo (evita doble optimización)
- Model change en optimizer se mueve a policy step en compose

### Simulator (CI)

Simulator invoca `ModelSelectionPolicy` + `ExpectedValueCalculator` con dos modelos candidatos. No duplica pricing math.

### Persistencia

`ExecutionPlanStep.selectedModel` y `AiTask.selectedModel` son **snapshots inmutables** post-decisión.

Evento `ModelSelected` en timeline incluye `source` field.

---

## Consecuencias

### Positivas

- Una sola fuente de verdad en runtime (`AiTask.selectedModel`).
- CI recomienda; Execution aplica; audit trail claro.
- Simulator coherente con ejecución real.

### Negativas

- Refactor de `CostOptimizerService` (dejar de cambiar modelos).
- Migrar `ModelSelectorService` requiere tests de regresión en plan compose.

### Invariante

> En ejecución, el modelo usado **debe** ser igual al snapshot del task, salvo retry explícito con override.

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|-------------|---------------------|
| CI selecciona en runtime | CI acoplado a Execution; viola bounded context |
| Planner único selector | CI simulator contradice planner |
| Runner siempre elige | Ignora decisiones humanas y CI |
| Modelo solo en handler env | No respeta presupuesto ni preview |

---

## Implicaciones de implementación

1. **ADR-004 primero:** `TaskCompleted` handler antes de mover model logic.
2. `AiTaskRunner`: priorizar `task.selectedModel` sobre `handler.defaultModel`.
3. Action Preview UI muestra modelo con badge `source` (económico / manual / default).
4. Tests: mismo input → preview model === executed model.

### Config

`CommercialIntelligenceConfig` **no** lista modelos por task. Eso vive en `TASK_CAPABILITIES` + `AiModelPricing` hasta ADR futuro de externalizar capabilities a DB.

CI solo referencia modelos en recomendación verbal (“conviene Flash”) derivado de policy output.
