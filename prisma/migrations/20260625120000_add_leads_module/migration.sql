-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ANALYZED', 'CONTACTED', 'INTERESTED', 'MEETING_SCHEDULED', 'CLIENT', 'LOST');

-- CreateEnum
CREATE TYPE "LeadAnalysisType" AS ENUM ('BUSINESS_DIAGNOSIS', 'INSTAGRAM_MESSAGE', 'WHATSAPP_MESSAGE', 'EMAIL_MESSAGE');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "website" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "hasWebsite" BOOLEAN NOT NULL DEFAULT false,
    "hasOnlineMenu" BOOLEAN NOT NULL DEFAULT false,
    "hasReservations" BOOLEAN NOT NULL DEFAULT false,
    "hasWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "hasEcommerce" BOOLEAN NOT NULL DEFAULT false,
    "branchCount" INTEGER NOT NULL DEFAULT 1,
    "score" INTEGER NOT NULL DEFAULT 0,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdById" TEXT,
    "convertedRestaurantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAnalysis" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadAnalysisType" NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatusChange" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatus" "LeadStatus",
    "toStatus" "LeadStatus" NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_category_idx" ON "Lead"("category");

-- CreateIndex
CREATE INDEX "Lead_city_idx" ON "Lead"("city");

-- CreateIndex
CREATE INDEX "Lead_score_idx" ON "Lead"("score");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "LeadAnalysis_leadId_type_idx" ON "LeadAnalysis"("leadId", "type");

-- CreateIndex
CREATE INDEX "LeadAnalysis_createdAt_idx" ON "LeadAnalysis"("createdAt");

-- CreateIndex
CREATE INDEX "LeadStatusChange_leadId_changedAt_idx" ON "LeadStatusChange"("leadId", "changedAt");

-- CreateIndex
CREATE INDEX "LeadStatusChange_toStatus_idx" ON "LeadStatusChange"("toStatus");

-- AddForeignKey
ALTER TABLE "LeadAnalysis" ADD CONSTRAINT "LeadAnalysis_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusChange" ADD CONSTRAINT "LeadStatusChange_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
