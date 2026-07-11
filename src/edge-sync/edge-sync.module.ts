import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminAlertsModule } from '../admin-alerts/admin-alerts.module';
import { isCloudMode } from '../common/config/bentoo-mode.config';
import { FloorModule } from '../floor/floor.module';
import { EdgeSyncAuthGuard } from './edge-sync-auth.guard';
import { EdgeSyncController } from './edge-sync.controller';
import { EdgeSyncLocalModule } from './edge-sync-local.module';
import { EdgeSyncPushApplyService } from './edge-sync-push-apply.service';
import { EdgeSyncService } from './edge-sync.service';
import { EdgeSyncStaleMonitorService } from './edge-sync-stale-monitor.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AdminAlertsModule,
    EdgeSyncLocalModule,
    forwardRef(() => FloorModule),
  ],
  controllers: isCloudMode() ? [EdgeSyncController] : [],
  providers: [
    EdgeSyncService,
    EdgeSyncPushApplyService,
    EdgeSyncAuthGuard,
    ...(isCloudMode() ? [EdgeSyncStaleMonitorService] : []),
  ],
  exports: [EdgeSyncService, EdgeSyncLocalModule],
})
export class EdgeSyncModule {}
