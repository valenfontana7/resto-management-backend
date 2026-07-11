import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { isLocalMode } from '../common/config/bentoo-mode.config';
import { EdgeSyncOutboxService } from './edge-sync-outbox.service';
import { EdgeSyncOutboxRecorder } from './edge-sync-outbox.recorder';
import { EdgeSyncPullApplyService } from './edge-sync-pull-apply.service';
import { EdgeSyncWorkerService } from './edge-sync-worker.service';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [
    EdgeSyncOutboxService,
    EdgeSyncOutboxRecorder,
    EdgeSyncPullApplyService,
    ...(isLocalMode() ? [EdgeSyncWorkerService] : []),
  ],
  exports: [
    EdgeSyncOutboxService,
    EdgeSyncOutboxRecorder,
    EdgeSyncPullApplyService,
  ],
})
export class EdgeSyncLocalModule {}
