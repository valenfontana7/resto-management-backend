-- CreateTable
CREATE TABLE "RestaurantIntelligenceSnapshotCache" (
    "restaurantId" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "bundle" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantIntelligenceSnapshotCache_pkey" PRIMARY KEY ("restaurantId")
);

-- AddForeignKey
ALTER TABLE "RestaurantIntelligenceSnapshotCache" ADD CONSTRAINT "RestaurantIntelligenceSnapshotCache_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
