import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminAlertsModule } from '../admin-alerts/admin-alerts.module';
import { isCloudMode, isLocalMode } from '../common/config/bentoo-mode.config';
import { EdgeSyncAuthGuard } from './edge-sync-auth.guard';
import { EdgeSyncController } from './edge-sync.controller';
import { EdgeSyncService } from './edge-sync.service';
import { EdgeSyncStaleMonitorService } from './edge-sync-stale-monitor.service';
import { EdgeSyncWorkerService } from './edge-sync-worker.service';

@Module({
  imports: [ScheduleModule.forRoot(), AdminAlertsModule],
  controllers: isCloudMode() ? [EdgeSyncController] : [],
  providers: [
    EdgeSyncService,
    EdgeSyncAuthGuard,
    ...(isCloudMode() ? [EdgeSyncStaleMonitorService] : []),
    ...(isLocalMode() ? [EdgeSyncWorkerService] : []),
  ],
  exports: [EdgeSyncService],
})
export class EdgeSyncModule {}
