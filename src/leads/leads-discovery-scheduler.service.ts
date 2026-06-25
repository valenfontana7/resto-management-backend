import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadsSavedSearchService } from './leads-saved-search.service';
import { LeadsAiService } from './leads-ai.service';
import { OnboardingAiQuotaService } from '../common/services/onboarding-ai-quota.service';
import { DiscoverLeadsDto } from './dto/discover-leads.dto';

@Injectable()
export class LeadsDiscoverySchedulerService {
  private readonly logger = new Logger(LeadsDiscoverySchedulerService.name);

  constructor(
    private readonly savedSearchService: LeadsSavedSearchService,
    private readonly leadsAiService: LeadsAiService,
    private readonly aiQuota: OnboardingAiQuotaService,
  ) {}

  @Cron('0 * * * *')
  async runDueSavedSearches() {
    const due = await this.savedSearchService.findDue();
    if (due.length === 0) return;

    this.logger.log(
      `Running ${due.length} scheduled lead discovery search(es)`,
    );

    for (const search of due) {
      try {
        if (search.createdById) {
          await this.aiQuota.checkUserQuota(search.createdById, 'discover');
        }

        const filters = (search.filters ?? {}) as {
          city?: string;
          category?: string;
          maxResults?: number;
        };

        const dto: DiscoverLeadsDto = {
          query: search.query,
          city: filters.city,
          category: filters.category,
          maxResults: filters.maxResults,
        };

        const result = await this.leadsAiService.discoverProspects(
          dto,
          search.createdById ?? undefined,
        );

        if (
          search.createdById &&
          (result.status === 'success' || result.status === 'empty')
        ) {
          await this.aiQuota.incrementUserQuota(search.createdById, 'discover');
        }

        await this.savedSearchService.markRun(search.id);
        this.logger.log(
          `Saved search ${search.id} completed with status ${result.status}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Scheduled search ${search.id} failed: ${message}`);
      }
    }
  }
}
