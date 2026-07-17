-- Pause/activate de campañas LCM desde Marketing Hub (sin tocar el catálogo JSON).
CREATE TABLE IF NOT EXISTS "LifecycleCampaignOverride" (
    "campaignId" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifecycleCampaignOverride_pkey" PRIMARY KEY ("campaignId")
);
