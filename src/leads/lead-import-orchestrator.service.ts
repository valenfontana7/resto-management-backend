import { Injectable } from '@nestjs/common';
import { Lead } from '@prisma/client';
import { ExpectedValueEngineService } from '../commercial-intelligence/decisioning/expected-value-engine.service';
import { CommercialActionOrchestratorService } from '../commercial-intelligence/decisioning/commercial-action-orchestrator.service';
import { CommercialConfigService } from '../commercial-intelligence/config/commercial-config.service';
import type { ActionIntelligenceResult } from '../commercial-intelligence/types/commercial-intelligence.types';
import { LeadsService } from './leads.service';
import type { ImportLeadsDto } from './dto/import-leads.dto';
import type { ImportLeadsResult } from './types/lead-discovery.types';

export type ImportPostProcessMode = 'off' | 'suggest' | 'auto';

export interface ImportLeadsExtendedResult extends ImportLeadsResult {
  suggestedActions: ActionIntelligenceResult[];
  autoStartedGoals: string[];
}

@Injectable()
export class LeadImportOrchestratorService {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly evEngine: ExpectedValueEngineService,
    private readonly orchestrator: CommercialActionOrchestratorService,
    private readonly config: CommercialConfigService,
  ) {}

  async importWithIntelligence(
    dto: ImportLeadsDto,
    userId?: string,
    postProcessMode: ImportPostProcessMode = 'suggest',
  ): Promise<ImportLeadsExtendedResult> {
    const result = await this.leadsService.importCandidates(
      dto.candidates.map((c) => ({
        ...c,
        discoveredWithAi: c.discoveredWithAi ?? true,
        discoverySessionId:
          c.discoverySessionId ?? dto.discoverySessionId ?? undefined,
      })),
      userId,
    );

    const cfg = await this.config.getActive();
    const minScore = cfg.thresholds.importAutoMinScore ?? 60;
    const suggestedActions: ActionIntelligenceResult[] = [];
    const autoStartedGoals: string[] = [];

    for (const lead of result.created as Lead[]) {
      const evaluation = await this.evEngine.evaluateLead(lead);

      const actionable =
        evaluation.verdict === 'DO_NOW' ||
        evaluation.verdict === 'GENERATE_DEMO' ||
        evaluation.verdict === 'USE_FLASH';

      if (!actionable || lead.score < minScore) continue;

      suggestedActions.push(evaluation);

      if (postProcessMode === 'auto') {
        try {
          const act = await this.orchestrator.act(evaluation, 'auto', userId);
          if (act.goal?.id) autoStartedGoals.push(act.goal.id);
        } catch {
          // skip failed auto starts
        }
      }
    }

    suggestedActions.sort((a, b) => b.priority - a.priority);

    return {
      ...result,
      suggestedActions,
      autoStartedGoals,
    };
  }
}
