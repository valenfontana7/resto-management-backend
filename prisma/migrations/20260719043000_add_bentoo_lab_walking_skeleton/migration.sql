CREATE TYPE "SimulationRunStatus" AS ENUM (
  'CREATED',
  'BOOTSTRAPPING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'STOPPED',
  'CLEANING',
  'CLEANUP_FAILED'
);

CREATE TABLE "SimulationRun" (
  "id" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "scenarioVersion" TEXT NOT NULL,
  "repetitionKey" TEXT NOT NULL,
  "seedState" TEXT NOT NULL,
  "status" "SimulationRunStatus" NOT NULL DEFAULT 'CREATED',
  "restaurantId" TEXT,
  "simulatedStartAt" TIMESTAMP(3) NOT NULL,
  "simulatedNow" TIMESTAMP(3) NOT NULL,
  "visualSpeed" INTEGER NOT NULL DEFAULT 20,
  "runtimeState" JSONB NOT NULL DEFAULT '{}',
  "invariantResults" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimulationTimelineEvent" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "logicalEventId" TEXT NOT NULL,
  "logicalEntityKey" TEXT NOT NULL,
  "simulatedAt" TIMESTAMP(3) NOT NULL,
  "realAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "participantKey" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resultCode" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "correlationId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,

  CONSTRAINT "SimulationTimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SimulationRun_restaurantId_key"
ON "SimulationRun"("restaurantId");

CREATE INDEX "SimulationRun_scenarioId_scenarioVersion_idx"
ON "SimulationRun"("scenarioId", "scenarioVersion");

CREATE INDEX "SimulationRun_status_idx"
ON "SimulationRun"("status");

CREATE INDEX "SimulationRun_createdAt_idx"
ON "SimulationRun"("createdAt");

CREATE UNIQUE INDEX "SimulationTimelineEvent_runId_sequence_key"
ON "SimulationTimelineEvent"("runId", "sequence");

CREATE UNIQUE INDEX "SimulationTimelineEvent_runId_logicalEventId_key"
ON "SimulationTimelineEvent"("runId", "logicalEventId");

CREATE INDEX "SimulationTimelineEvent_runId_simulatedAt_idx"
ON "SimulationTimelineEvent"("runId", "simulatedAt");

CREATE INDEX "SimulationTimelineEvent_entityType_entityId_idx"
ON "SimulationTimelineEvent"("entityType", "entityId");

ALTER TABLE "SimulationRun"
ADD CONSTRAINT "SimulationRun_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SimulationTimelineEvent"
ADD CONSTRAINT "SimulationTimelineEvent_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "SimulationRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
