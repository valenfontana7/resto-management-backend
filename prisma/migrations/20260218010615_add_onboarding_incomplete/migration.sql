-- AlterTable (only add column if it doesn't exist)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Restaurant' AND column_name='onboardingIncomplete') THEN
        ALTER TABLE "Restaurant" ADD COLUMN "onboardingIncomplete" BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;
