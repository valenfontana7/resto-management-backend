# ADR-002: Modelo de `expectedRevenueUsd`

**Estado:** Aceptado  
**Fecha:** 2026-07-02  
**Decisores:** Producto + Engineering  
**Relacionado:** ADR-001, ADR-003

---

## Contexto

Expected Value Engine necesita un beneficio monetario estimado:

```
EV = (P_success × expectedRevenueUsd) − actionCostUsd − riskPenalty
```

Pregunta abierta #2: ¿Qué es `expectedRevenueUsd`?

Opciones evaluadas:
- MRR fijo por plan Bentoo
- Valor por segmento de restaurante
- Revenue real del restaurante (incorrecto — no es nuestro producto tenant)
- Valor de pipeline (probabilidad × deal size)

Hoy no hay CRM con deal size ni historial de cierres suficiente para ML.

---

## Decisión

`expectedRevenueUsd` representa el **valor económico esperado para Bentoo** al convertir un lead en cliente SaaS, expresado como **valor presente de 12 meses de suscripción**, antes de probabilidad de éxito.

### Fórmula

```
expectedRevenueUsd = baseDealValueUsd × segmentMultiplier × signalMultiplier
```

Donde:
- `baseDealValueUsd` — config global (default: **USD 348** = 12 × USD 29 plan Starter referencia)
- `segmentMultiplier` — tabla en config por segmento
- `signalMultiplier` — producto de multiplicadores por señales activas (cap 2.0)

### Tabla de segmentos (defaults en config, no hardcode en código)

| Segment key | Condición | Multiplier |
|-------------|-----------|------------|
| `standard` | default | 1.0 |
| `multi_branch` | `branchCount > 1` | 1.4 |
| `premium` | score > 80 o categoría premium | 1.6 |
| `high_intent` | status ≥ INTERESTED | 2.0 |
| `cold` | sin contacto > 30 días | 0.6 |

### Señales (multiplicadores acumulativos, cap 2.0)

| Signal | Multiplier |
|--------|------------|
| `no_website` | 1.15 |
| `no_online_menu` | 1.10 |
| `high_reviews` (futuro enrichment) | 1.20 |
| `has_whatsapp` | 1.05 (facilita cierre) |

### Probabilidad de éxito (`P_success`)

Separada de revenue. Heurística inicial en config:

```
P_success = clamp(
  w_status × statusScore +
  w_fit × normalize(lead.score) +
  w_channel × channelScore +
  w_recency × recencyScore,
  0.05, 0.95
)
```

`statusScore` por enum LeadStatus (NEW=0.15, ANALYZED=0.25, CONTACTED=0.35, INTERESTED=0.55, MEETING_SCHEDULED=0.75).

### Valor en pipeline vs valor realizado

| Métrica | Definición |
|---------|------------|
| `expectedRevenueUsd` | Valor si convierte (antes de P) |
| `expectedValueUsd` | EV después de P y costo |
| `realizedRevenueUsd` | Solo cuando `Lead.status = CLIENT`; tomar MRR real del plan contratado cuando exista dato |

Hasta tener dato real: `realizedRevenueUsd = baseDealValueUsd` fijo al cerrar.

---

## Consecuencias

### Positivas

- Configurable sin deploy (ADR alineado con “nunca hardcodear pesos”).
- Interpretable comercialmente (“este lead vale ~USD 400 si cierra”).
- Preparado para calibración cuando haya historial de cierres.

### Negativas

- Defaults son arbitrarios hasta calibrar con ventas reales.
- Segmentos premium requieren definición de producto explícita.

### Mitigaciones

- Exponer en UI: “Valor estimado basado en supuestos editables”.
- Admin PATCH en `CommercialIntelligenceConfig.segments`.
- Recalcular `LearningOutcome` al cerrar venta para futura calibración (sin auto-tune).

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|-------------|---------------------|
| MRR fijo único | Ignora premium / multi-sucursal |
| Revenue del restaurante | Wrong domain — no es GTM Bentoo |
| Solo lead.score como proxy | No es monetario; confunde con fit |
| Deal size manual por lead | No escala; opcional como override futuro |

---

## Implicaciones de implementación

1. Renombrar en UI: **“Valor potencial (12m)”**, no “Revenue”.
2. Campo opcional futuro: `Lead.dealValueOverrideUsd` para casos enterprise.
3. ROI dashboard: distinguir **ROI esperado** vs **ROI realizado post-CLIENT**.
