import { Injectable } from '@nestjs/common';
import { BusinessEventStoreService } from '../../business-events/business-event-store.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import type { BentooBusinessEvent } from '../../business-events/types/business-event.types';
import { OwnershipService } from '../../common/services/ownership.service';
import { ShiftService } from './shift.service';
import {
  timelineKindForEvent,
  TIMELINE_EXECUTION_EVENTS,
  TIMELINE_QUERY_EVENTS,
  type TimelineEntryKind,
} from '../utils/timeline-events';

const MAX_EXECUTION_ENTRIES = 24;

function payloadText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

export interface TimelineEntry {
  id: string;
  occurredAt: string;
  kind: TimelineEntryKind;
  eventType: string;
  label: string;
  detail?: string;
  coordinationId?: string;
  preparationId?: string;
}

@Injectable()
export class TimelineProjectionService {
  constructor(
    private readonly ownership: OwnershipService,
    private readonly shifts: ShiftService,
    private readonly eventStore: BusinessEventStoreService,
  ) {}

  async getTimeline(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const current = await this.shifts.getCurrent(restaurantId, userId);
    if (!current.shift) {
      return { shift: null, entries: [] as TimelineEntry[] };
    }

    const shift = current.shift;
    const since = shift.openedAt
      ? new Date(shift.openedAt)
      : new Date(shift.createdAt);
    const until = shift.closedAt ? new Date(shift.closedAt) : new Date();

    const events = await this.eventStore.query(restaurantId, {
      since,
      until,
      eventTypes: [...TIMELINE_QUERY_EVENTS],
      limit: 400,
    });

    const entries = this.project(events);
    return { shift, entries };
  }

  private project(events: BentooBusinessEvent[]): TimelineEntry[] {
    const executionCap = MAX_EXECUTION_ENTRIES;
    let executionCount = 0;
    const entries: TimelineEntry[] = [];

    for (const event of events) {
      const kind = timelineKindForEvent(event.eventType);
      if (kind === 'execution' && executionCount >= executionCap) {
        continue;
      }

      const entry = this.toEntry(event, kind);
      if (!entry) continue;

      entries.push(entry);
      if (kind === 'execution') executionCount += 1;
    }

    return entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  private toEntry(
    event: BentooBusinessEvent,
    kind: TimelineEntryKind,
  ): TimelineEntry | null {
    const payload = (event.payload ?? {}) as unknown as Record<string, unknown>;
    const base = {
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      kind,
      eventType: event.eventType,
    };

    switch (event.eventType) {
      case BentooBusinessEventType.ShiftOpened: {
        const roster = payload.rosterCount as number | undefined;
        return {
          ...base,
          label: 'Turno abierto',
          detail:
            roster != null
              ? `${roster} en roster · ${payloadText(payload.segment)}`
              : undefined,
        };
      }
      case BentooBusinessEventType.ShiftClosingStarted:
        return { ...base, label: 'Inicio de cierre' };
      case BentooBusinessEventType.ShiftClosed: {
        const stats = payload.coordinationStats as
          | { resolved?: number; total?: number }
          | undefined;
        return {
          ...base,
          label: 'Turno cerrado',
          detail:
            stats?.total != null
              ? `${stats.resolved ?? 0}/${stats.total} coordinaciones resueltas`
              : undefined,
        };
      }
      case BentooBusinessEventType.ShiftLeadAssigned:
        return { ...base, label: 'Lead asignado' };
      case BentooBusinessEventType.HandoffPublished:
        return { ...base, label: 'Traspaso publicado' };
      case BentooBusinessEventType.HandoffAccepted:
        return { ...base, label: 'Traspaso aceptado' };
      case BentooBusinessEventType.RestaurantOpened:
        return { ...base, label: 'Operación diaria abierta' };
      case BentooBusinessEventType.CoordinationOpened: {
        const type = payloadText(payload.type, 'COORD');
        const title = payloadText(payload.title, 'Coordinación');
        return {
          ...base,
          label: `${type} · ${title}`,
          coordinationId: payload.coordinationId as string | undefined,
        };
      }
      case BentooBusinessEventType.CoordinationCompleted: {
        const outcome = payloadText(payload.outcome, 'RESOLVED');
        return {
          ...base,
          label: `Coordinación ${outcome.toLowerCase()}`,
          detail: payload.resultSummary as string | undefined,
          coordinationId: payload.coordinationId as string | undefined,
        };
      }
      case BentooBusinessEventType.CoordinationAcknowledged:
        return {
          ...base,
          label: 'Coordinación confirmada',
          coordinationId: payload.coordinationId as string | undefined,
        };
      case BentooBusinessEventType.CoordinationEscalated:
        return {
          ...base,
          label: 'Coordinación escalada',
          coordinationId: payload.coordinationId as string | undefined,
        };
      case BentooBusinessEventType.CoordinationDeclined:
        return {
          ...base,
          label: 'Coordinación rechazada',
          coordinationId: payload.coordinationId as string | undefined,
        };
      case BentooBusinessEventType.HelpRequested:
        return { ...base, label: 'Pedido de ayuda' };
      case BentooBusinessEventType.ApprovalRequested:
        return { ...base, label: 'Aprobación solicitada' };
      case BentooBusinessEventType.ApprovalResolved: {
        const approved = payload.approved === true;
        return {
          ...base,
          label: approved ? 'Aprobación concedida' : 'Aprobación rechazada',
        };
      }
      case BentooBusinessEventType.IntelligenceMovePrepared: {
        return {
          ...base,
          label: `IA · ${payloadText(payload.title, 'Movimiento')}`,
          detail: payload.situationType as string | undefined,
          preparationId: payload.preparationId as string | undefined,
        };
      }
      case BentooBusinessEventType.OrderCreated:
        return { ...base, label: 'Pedido nuevo' };
      case BentooBusinessEventType.ProductOutOfStock: {
        const name =
          payloadText(payload.dishName) || payloadText(payload.productName);
        return {
          ...base,
          label: name ? `Sin ${name}` : 'Producto agotado',
        };
      }
      case BentooBusinessEventType.ReservationCreated:
        return { ...base, label: 'Reserva nueva' };
      case BentooBusinessEventType.OrderReadyStale:
        return { ...base, label: 'Comanda lista sin retirar' };
      case BentooBusinessEventType.InventoryLowStock: {
        const item =
          payloadText(payload.itemName) ||
          payloadText(payload.inventoryItemName);
        return {
          ...base,
          label: item ? `Stock bajo: ${item}` : 'Stock bajo',
        };
      }
      default: {
        if (
          !(TIMELINE_EXECUTION_EVENTS as readonly string[]).includes(
            event.eventType,
          )
        ) {
          return null;
        }
        return { ...base, label: event.eventType };
      }
    }
  }
}
