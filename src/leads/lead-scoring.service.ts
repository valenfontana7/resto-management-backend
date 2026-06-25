import { Injectable } from '@nestjs/common';
import {
  buildScoringInputFromLead,
  calculateLeadScore,
  getLeadPriority,
  type LeadPriority,
} from './lead-scoring.rules';

@Injectable()
export class LeadScoringService {
  computeScore(lead: Parameters<typeof buildScoringInputFromLead>[0]): number {
    return calculateLeadScore(buildScoringInputFromLead(lead));
  }

  getPriority(score: number): LeadPriority {
    return getLeadPriority(score);
  }
}
