import { Injectable } from '@nestjs/common';
import { Lead, LeadStatus } from '@prisma/client';
import type { CommercialActionType } from '../types/commercial-intelligence.types';

export interface ResolvedAction {
  actionType: CommercialActionType;
  taskKey?: string;
  label: string;
}

@Injectable()
export class ActionCatalogService {
  resolvePrimaryAction(lead: Lead): ResolvedAction {
    if (lead.status === LeadStatus.LOST || lead.status === LeadStatus.CLIENT) {
      return {
        actionType: 'NO_ACTION',
        label: 'Sin acción (prospecto cerrado)',
      };
    }

    if (lead.status === LeadStatus.CONTACTED) {
      return {
        actionType: 'SEND_FOLLOWUP',
        taskKey: 'leads.draft_followup',
        label: 'Enviar seguimiento',
      };
    }

    if (lead.status === LeadStatus.NEW || lead.status === LeadStatus.ANALYZED) {
      if (!lead.hasWebsite && lead.score >= 70) {
        return {
          actionType: 'GENERATE_PROSPECT_PACKAGE',
          taskKey: 'leads.run_prospect_pipeline',
          label: 'Armar demo y paquete de venta',
        };
      }

      if (!lead.hasWebsite && lead.score >= 60) {
        return {
          actionType: 'GENERATE_DEMO',
          taskKey: 'leads.generate_demo',
          label: 'Generar demo personalizada',
        };
      }

      const taskKey = lead.whatsapp
        ? 'leads.draft_message_whatsapp'
        : lead.instagram
          ? 'leads.draft_message_instagram'
          : lead.email
            ? 'leads.draft_message_email'
            : undefined;

      if (taskKey) {
        return {
          actionType: 'SEND_FIRST_MESSAGE',
          taskKey,
          label: 'Enviar primer mensaje',
        };
      }

      return {
        actionType: 'RE_ANALYZE',
        taskKey: 'leads.business_diagnosis',
        label: 'Revisar oportunidad',
      };
    }

    if (
      lead.status === LeadStatus.INTERESTED ||
      lead.status === LeadStatus.MEETING_SCHEDULED
    ) {
      return {
        actionType: 'RE_ANALYZE',
        taskKey: 'leads.business_diagnosis',
        label: 'Actualizar diagnóstico',
      };
    }

    return { actionType: 'WAIT', label: 'Esperar antes de contactar' };
  }

  resolveAlternatives(
    lead: Lead,
    primary: CommercialActionType,
  ): ResolvedAction[] {
    const alts: ResolvedAction[] = [];

    if (primary !== 'GENERATE_DEMO' && !lead.hasWebsite && lead.score >= 50) {
      alts.push({
        actionType: 'GENERATE_DEMO',
        taskKey: 'leads.generate_demo',
        label: 'Generar demo (alternativa)',
      });
    }

    if (
      primary !== 'GENERATE_PROSPECT_PACKAGE' &&
      !lead.hasWebsite &&
      lead.score >= 65
    ) {
      alts.push({
        actionType: 'GENERATE_PROSPECT_PACKAGE',
        taskKey: 'leads.run_prospect_pipeline',
        label: 'Armar demo y paquete de venta',
      });
    }

    if (primary !== 'RE_ANALYZE') {
      alts.push({
        actionType: 'RE_ANALYZE',
        taskKey: 'leads.business_diagnosis',
        label: 'Revisar sin contactar',
      });
    }

    alts.push({ actionType: 'WAIT', label: 'Esperar 5 días' });
    alts.push({
      actionType: 'NO_ACTION',
      label: 'No gastar presupuesto ahora',
    });

    return alts;
  }
}
