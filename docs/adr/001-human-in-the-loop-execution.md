# ADR-001: Ejecución human-in-the-loop con umbral EV opcional

**Estado:** Aceptado  
**Fecha:** 2026-07-02  
**Decisores:** Producto + Engineering (Bentoo AI Platform)  
**Relacionado:** ADR-002, ADR-003, ADR-004

---

## Contexto

Commercial Intelligence generará recomendaciones de acción (contactar, esperar, generar demo, crear objetivo, etc.). El Planner ejecuta planes de AI Tasks con costo real en USD.

Hoy existe:
- Approval workflow para mensajes/demos (`LeadApprovalService`)
- Aprobación explícita de planes (`ExecutionPlanStatus.PENDING_APPROVAL`)
- Presupuesto con hard stop (`AiCostBudget`)

La auditoría identificó riesgo de **doble cerebro** si Commercial Intelligence auto-ejecuta mientras el Planner también decide modelos y pasos.

Pregunta abierta #1: ¿Auto-ejecutar goals sugeridos o siempre humano-in-the-loop?

---

## Decisión

**Modelo híbrido en tres niveles de autonomía:**

| Nivel | Comportamiento | Cuándo |
|-------|----------------|--------|
| **L0 — Recomendar** (default) | CI genera recomendación + preview EV. Usuario confirma. | Siempre disponible |
| **L1 — Sugerir objetivo** | CI pre-llena `CreateGoal` payload. Usuario revisa plan y aprueba. | Acciones agrupadas / clusters |
| **L2 — Auto-ejecutar** | CI crea goal + buildPlan + execute sin confirmación intermedia. | Solo si se cumplen **todas** las condiciones abajo |

### Condiciones para L2 (auto-ejecutar)

Configurables en `CommercialIntelligenceConfig.thresholds`:

1. `expectedValueUsd >= minAutoEvUsd` (default: **0.50**)
2. `confidence >= minAutoConfidence` (default: **0.85**)
3. `actionCostUsd <= maxAutoCostUsd` (default: **0.25**)
4. Presupuesto restante mensual **> 20%** del límite
5. Acción **no** requiere approval workflow (`requiresApproval === false` para todas las tasks del plan)
6. Feature flag explícito: `COMMERCIAL_AUTO_EXECUTE=true` (default: **false** en prod)

### Acciones que **nunca** auto-ejecutan (L0 forzado)

- Primer mensaje a lead nuevo (WhatsApp / IG / email)
- Generación de demo
- Propuesta comercial
- Cualquier acción con `requiresApproval: true` en task registry

### Registro obligatorio

Toda recomendación L0/L1/L2 persiste un `CommercialDecision` con:
- `recommendedAction`
- `chosenAction` (null si L2)
- `autonomyLevel`: `RECOMMEND | SUGGEST_GOAL | AUTO_EXECUTE`

Eventos: `RecommendationGenerated`, `DecisionAccepted`, `DecisionRejected` (ADR-004).

---

## Consecuencias

### Positivas

- Alineado con posicionamiento “Director Comercial”: el humano ve el **por qué** antes de gastar.
- Reduce riesgo de quemar presupuesto en acciones de bajo EV.
- L2 opcional permite escalar operación cuando haya confianza calibrada.
- Compatible con approval workflow existente.

### Negativas

- L2 agrega complejidad de config y feature flags.
- Latencia adicional vs full-auto (aceptable para GTM de Bentoo hoy).

### Neutral

- El Planner **no cambia**: sigue requiriendo `APPROVED` para planes con pasos de approval.
- L2 solo salta confirmación de **creación de objetivo**, no de mensajes.

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|-------------|---------------------|
| **A) Siempre manual** | Demasiado lento cuando CI tenga alta confianza; no escala |
| **B) Full auto por default** | Riesgo reputacional + costo; contradice approval workflow |
| **C) Auto solo para tasks code (score, detect)** | Fragmenta UX; usuario no entiende qué es automático |

---

## Implicaciones de implementación

1. UI principal `/master/leads/hoy`: botón primario **“Hacerlo”** (L0→L1), no “Ejecutar silenciosamente”.
2. API: `POST .../recommendations/:id/act` siempre; `POST .../recommendations/:id/auto` solo con L2 gate.
3. No implementar L2 en MVP (Fase 1). Solo L0 + L1.
