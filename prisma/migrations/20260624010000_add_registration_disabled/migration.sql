-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "registrationDisabled" BOOLEAN NOT NULL DEFAULT false;
