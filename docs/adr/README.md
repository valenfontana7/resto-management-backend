# Architecture Decision Records — Commercial Intelligence

Decisiones formales previas a implementar la capa de inteligencia comercial de Bentoo.

| ADR | Título | Estado |
|-----|--------|--------|
| [001](./001-human-in-the-loop-execution.md) | Ejecución human-in-the-loop con umbral EV | Aceptado |
| [002](./002-expected-revenue-model.md) | Modelo de `expectedRevenueUsd` | Aceptado |
| [003](./003-commercial-intelligence-naming.md) | Bounded context: Commercial Intelligence | Aceptado |
| [004](./004-domain-events-outbox.md) | Event bus vía outbox PostgreSQL | **Implementado** (Fase 0) |
| [005](./005-model-selection-ownership.md) | Ownership de selección de modelo IA | Aceptado |
| [006](./006-unified-commercial-feed.md) | Bandeja comercial unificada (Work Queue) | Aceptado |
| [008](./008-deprecate-leads-task-orchestrator.md) | Deprecación de `LeadsTaskOrchestratorService` | **Implementado** |

## Convención

- **Estado:** Propuesto → Aceptado → Deprecado → Reemplazado
- **Fecha:** ISO 8601
- Cada ADR es independiente pero referencia las demás cuando aplica.

## Orden de lectura recomendado

1. ADR-003 (naming y bounded context)
2. ADR-004 (eventos — base técnica)
3. ADR-002 (semántica económica)
4. ADR-005 (modelo IA)
5. ADR-001 (UX de ejecución)

## Próximos ADRs sugeridos (no incluidos)

- ADR-007: `workspaceId` en AI platform (multi-tenant)
