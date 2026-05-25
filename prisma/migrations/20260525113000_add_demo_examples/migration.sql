-- CreateTable
CREATE TABLE "DemoExample" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'restaurant',
    "cuisine" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT NOT NULL DEFAULT '',
    "neighborhood" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "DemoExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoExample_slug_key" ON "DemoExample"("slug");

-- CreateIndex
CREATE INDEX "DemoExample_isActive_idx" ON "DemoExample"("isActive");

-- CreateIndex
CREATE INDEX "DemoExample_isFeatured_idx" ON "DemoExample"("isFeatured");

-- CreateIndex
CREATE INDEX "DemoExample_sortOrder_idx" ON "DemoExample"("sortOrder");

-- CreateIndex
CREATE INDEX "DemoExample_city_idx" ON "DemoExample"("city");
