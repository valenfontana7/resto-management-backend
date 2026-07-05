-- CreateTable
CREATE TABLE "LifecycleTemplateOverride" (
    "templateId" TEXT NOT NULL,
    "subject" TEXT,
    "preview" TEXT,
    "body" TEXT,
    "cta" TEXT,
    "tone" TEXT,
    "locale" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifecycleTemplateOverride_pkey" PRIMARY KEY ("templateId")
);
