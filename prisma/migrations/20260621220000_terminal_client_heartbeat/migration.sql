-- Terminal heartbeat metadata for Bentoo Salon Desktop fleet visibility
ALTER TABLE "RestaurantTerminal" ADD COLUMN IF NOT EXISTS "clientVersion" TEXT;
ALTER TABLE "RestaurantTerminal" ADD COLUMN IF NOT EXISTS "localVersion" TEXT;
ALTER TABLE "RestaurantTerminal" ADD COLUMN IF NOT EXISTS "platform" TEXT;
