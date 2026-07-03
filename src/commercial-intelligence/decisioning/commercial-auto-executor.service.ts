import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CommercialActionOrchestratorService } from './commercial-action-orchestrator.service';
import { CommercialAutonomyService } from './commercial-autonomy.service';
import { CommercialTodayService } from './commercial-today.service';

@Injectable()
export class CommercialAutoExecutorService {
  private readonly logger = new Logger(CommercialAutoExecutorService.name);

  constructor(
    private readonly autonomy: CommercialAutonomyService,
    private readonly today: CommercialTodayService,
    private readonly orchestrator: CommercialActionOrchestratorService,
  ) {}

  @Cron('*/15 * * * *')
  async runScheduledAutoExecute() {
    if (!this.autonomy.isAutoExecuteEnabled()) return;

    const dashboard = await this.today.getTodayDashboard();
    const candidates = dashboard.recommended.slice(0, 3);

    if (candidates.length === 0) return;

    this.logger.log(
      `L2 auto-executor: evaluando ${candidates.length} recomendación(es)`,
    );

    const { succeeded, failed } = await this.orchestrator.actBatch(
      candidates,
      'auto',
      undefined,
      3,
    );

    if (succeeded > 0 || failed > 0) {
      this.logger.log(
        `L2 auto-executor completado: ${succeeded} ok, ${failed} fallidas`,
      );
    }
  }
}
