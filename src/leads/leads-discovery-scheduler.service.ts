import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnboardingAiQuotaService } from '../common/services/onboarding-ai-quota.service';
import { AiTaskQueueService } from '../ai-platform/queue/ai-task-queue.service';
import { DiscoverLeadsDto } from './dto/discover-leads.dto';
import { LeadsSavedSearchService } from './leads-saved-search.service';

@Injectable()
export class LeadsDiscoverySchedulerService {
  private readonly logger = new Logger(LeadsDiscoverySchedulerService.name);

  constructor(
    private readonly savedSearchService: LeadsSavedSearchService,
    private readonly taskQueue: AiTaskQueueService,
    private readonly aiQuota: OnboardingAiQuotaService,
  ) {}

  @Cron('0 * * * *')
  async runDueSavedSearches() {
    const due = await this.savedSearchService.findDue();
    if (due.length === 0) return;

    this.logger.log(
      `Enqueueing ${due.length} scheduled lead discovery search(es)`,
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

        await this.taskQueue.enqueue({
          taskKey: 'leads.discover_restaurants',
          input: dto as unknown as Record<string, unknown>,
          savedSearchId: search.id,
          createdById: search.createdById ?? undefined,
          runImmediately: false,
        });

        if (search.createdById) {
          await this.aiQuota.incrementUserQuota(search.createdById, 'discover');
        }

        await this.savedSearchService.markRun(search.id);
        this.logger.log(`Saved search ${search.id} enqueued for discovery`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Scheduled search ${search.id} failed: ${message}`);
      }
    }
  }
}
