import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SimulationBootstrapService } from './bootstrap/simulation-bootstrap.service';
import {
  LAB_CLEANUP_ENV,
  SimulationCleanupService,
} from './cleanup/simulation-cleanup.service';
import { LAB_SAFETY_ENV, LabSafetyService } from './config/lab-safety.service';
import {
  LAB_EFFECTS_ENV,
  LabEffectsPolicyService,
} from './effects/lab-effects-policy.service';
import { SimulationTimelineService } from './timeline/simulation-timeline.service';
import { LAB_HTTP_ENV, LabHttpTransport } from './http/lab-http.transport';
import {
  LAB_MIDDLEWARE_ENV,
  LabExecutionContextMiddleware,
} from './http/lab-execution-context.middleware';
import { ClientParticipant } from './participants/client.participant';
import { InventoryParticipant } from './participants/inventory.participant';
import { KitchenParticipant } from './participants/kitchen.participant';
import { SimulationInvariantRegistry } from './invariants/simulation-invariant.registry';
import { SimulationRuntimeService } from './runtime/simulation-runtime.service';
import { BentooLabController } from './api/bentoo-lab.controller';

@Global()
@Module({
  imports: [PrismaModule, CommonModule, AuthModule],
  controllers: [BentooLabController],
  providers: [
    { provide: LAB_SAFETY_ENV, useValue: process.env },
    { provide: LAB_EFFECTS_ENV, useValue: process.env },
    { provide: LAB_CLEANUP_ENV, useValue: process.env },
    { provide: LAB_HTTP_ENV, useValue: process.env },
    { provide: LAB_MIDDLEWARE_ENV, useValue: process.env },
    LabEffectsPolicyService,
    LabSafetyService,
    LabHttpTransport,
    LabExecutionContextMiddleware,
    SimulationBootstrapService,
    SimulationCleanupService,
    SimulationTimelineService,
    ClientParticipant,
    KitchenParticipant,
    InventoryParticipant,
    SimulationInvariantRegistry,
    SimulationRuntimeService,
  ],
  exports: [
    LabEffectsPolicyService,
    SimulationBootstrapService,
    SimulationCleanupService,
    SimulationTimelineService,
    SimulationRuntimeService,
  ],
})
export class BentooLabModule {}
