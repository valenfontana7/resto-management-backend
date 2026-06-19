-- Idempotencia para mutaciones offline del salón (clientMutationId)

CREATE TABLE "FloorClientMutation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "mutationType" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorClientMutation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FloorClientMutation_restaurantId_clientMutationId_key" ON "FloorClientMutation"("restaurantId", "clientMutationId");
CREATE INDEX "FloorClientMutation_restaurantId_createdAt_idx" ON "FloorClientMutation"("restaurantId", "createdAt");
