import type { Participant } from '../types/operations.types';

export type ChecklistPhase = 'opening' | 'closing';

export type ChecklistAssignee =
  | {
      targetType: 'RESPONSIBILITY';
      targetId: 'SHIFT_LEAD' | 'CASH_LEAD' | 'CLOSING_LEAD';
    }
  | { targetType: 'ROLE'; targetId: string }
  | { targetType: 'STATION'; targetId: string };

export interface ChecklistTaskDef {
  id: string;
  phase: ChecklistPhase;
  title: string;
  description: string;
  deepLink: string;
  priority: 'NORMAL' | 'HIGH';
  assignee: ChecklistAssignee;
}

/** Catálogo canónico backend — labels/hrefs alineados al frontend. */
export const CHECKLIST_TASK_CATALOG: ChecklistTaskDef[] = [
  {
    id: 'open_cash',
    phase: 'opening',
    title: 'Abrir caja parcial',
    description: 'Abrí caja con fondo inicial en salón',
    deepLink: '/admin/salon',
    priority: 'HIGH',
    assignee: { targetType: 'RESPONSIBILITY', targetId: 'CASH_LEAD' },
  },
  {
    id: 'review_reservations',
    phase: 'opening',
    title: 'Revisar reservas del día',
    description: 'Confirmá mesas y horarios de hoy',
    deepLink: '/admin/reservations',
    priority: 'NORMAL',
    assignee: { targetType: 'RESPONSIBILITY', targetId: 'SHIFT_LEAD' },
  },
  {
    id: 'briefing_team',
    phase: 'opening',
    title: 'Alinear al equipo',
    description: 'Briefing corto cocina y salón',
    deepLink: '/admin',
    priority: 'NORMAL',
    assignee: { targetType: 'RESPONSIBILITY', targetId: 'SHIFT_LEAD' },
  },
  {
    id: 'check_printers',
    phase: 'opening',
    title: 'Verificar impresoras',
    description: 'Comandas e impresoras listas',
    deepLink: '/admin/salon',
    priority: 'NORMAL',
    assignee: { targetType: 'STATION', targetId: 'kitchen' },
  },
  {
    id: 'verify_menu',
    phase: 'opening',
    title: 'Confirmar platos disponibles',
    description: 'Revisá 86 y stock crítico',
    deepLink: '/admin/menu',
    priority: 'NORMAL',
    assignee: { targetType: 'STATION', targetId: 'kitchen' },
  },
  {
    id: 'close_tables',
    phase: 'closing',
    title: 'Cerrar mesas abiertas',
    description: 'Cobrálas o transferilas antes del cierre',
    deepLink: '/admin/salon',
    priority: 'HIGH',
    assignee: { targetType: 'ROLE', targetId: 'WAITER' },
  },
  {
    id: 'cash_count',
    phase: 'closing',
    title: 'Arqueo de efectivo',
    description: 'Contá efectivo vs esperado',
    deepLink: '/admin/salon',
    priority: 'HIGH',
    assignee: { targetType: 'RESPONSIBILITY', targetId: 'CASH_LEAD' },
  },
  {
    id: 'close_cash',
    phase: 'closing',
    title: 'Cerrar caja parcial',
    description: 'Cerrá caja e imprimí comprobante',
    deepLink: '/admin/salon',
    priority: 'HIGH',
    assignee: { targetType: 'RESPONSIBILITY', targetId: 'CASH_LEAD' },
  },
  {
    id: 'close_daily',
    phase: 'closing',
    title: 'Cerrar caja diaria',
    description: 'Cierre contable del día en operación',
    deepLink: '/admin/operacion',
    priority: 'HIGH',
    assignee: { targetType: 'RESPONSIBILITY', targetId: 'CLOSING_LEAD' },
  },
  {
    id: 'review_kitchen',
    phase: 'closing',
    title: 'Confirmar cocina al día',
    description: 'Sin comandas pendientes',
    deepLink: '/kitchen',
    priority: 'NORMAL',
    assignee: { targetType: 'STATION', targetId: 'kitchen' },
  },
  {
    id: 'tomorrow_prep',
    phase: 'closing',
    title: 'Revisar reservas de mañana',
    description: 'Prepará el día siguiente',
    deepLink: '/admin/reservations',
    priority: 'NORMAL',
    assignee: { targetType: 'RESPONSIBILITY', targetId: 'SHIFT_LEAD' },
  },
];

export function checklistDedupeKey(shiftId: string, itemId: string): string {
  return `policy:checklist:${shiftId}:${itemId}`;
}

export function parseChecklistItemIdFromDedupeKey(
  key: string | null | undefined,
): string | null {
  if (!key?.startsWith('policy:checklist:')) return null;
  const parts = key.split(':');
  // policy:checklist:{shiftId}:{itemId}
  return parts.length >= 4 ? parts.slice(3).join(':') : null;
}

export function resolveChecklistParticipant(
  def: ChecklistTaskDef,
  roster: Array<{
    userId: string;
    roleCode?: string;
    stationId?: string;
    responsibilities?: string[];
  }>,
): Participant {
  const assignee = def.assignee;

  if (assignee.targetType === 'RESPONSIBILITY') {
    const user = roster.find((a) =>
      (a.responsibilities ?? []).includes(assignee.targetId),
    );
    if (user) {
      return {
        targetType: 'USER',
        targetId: user.userId,
        participantRole: 'ASSIGNEE',
        ackRequired: false,
      };
    }
    // Fallback: SHIFT_LEAD user, then responsibility code
    if (assignee.targetId !== 'SHIFT_LEAD') {
      const lead = roster.find((a) =>
        (a.responsibilities ?? []).includes('SHIFT_LEAD'),
      );
      if (lead) {
        return {
          targetType: 'USER',
          targetId: lead.userId,
          participantRole: 'ASSIGNEE',
          ackRequired: false,
        };
      }
    }
    return {
      targetType: 'RESPONSIBILITY',
      targetId: assignee.targetId,
      participantRole: 'ASSIGNEE',
      ackRequired: false,
    };
  }

  if (assignee.targetType === 'STATION') {
    const onStation = roster.find((a) => a.stationId === assignee.targetId);
    if (onStation) {
      return {
        targetType: 'USER',
        targetId: onStation.userId,
        participantRole: 'ASSIGNEE',
        ackRequired: false,
      };
    }
    return {
      targetType: 'STATION',
      targetId: assignee.targetId,
      participantRole: 'ASSIGNEE',
      ackRequired: false,
    };
  }

  // ROLE
  const byRole = roster.find(
    (a) => (a.roleCode ?? '').toUpperCase() === assignee.targetId.toUpperCase(),
  );
  if (byRole) {
    return {
      targetType: 'USER',
      targetId: byRole.userId,
      participantRole: 'ASSIGNEE',
      ackRequired: false,
    };
  }
  return {
    targetType: 'ROLE',
    targetId: assignee.targetId,
    participantRole: 'ASSIGNEE',
    ackRequired: false,
  };
}
