-- Terminal hostname (correlación con edge) + token de dispositivo de larga duración
ALTER TABLE "RestaurantTerminal" ADD COLUMN IF NOT EXISTS "hostname" TEXT;
ALTER TABLE "RestaurantTerminal" ADD COLUMN IF NOT EXISTS "deviceTokenHash" TEXT;
ALTER TABLE "RestaurantTerminal" ADD COLUMN IF NOT EXISTS "deviceTokenExpiresAt" TIMESTAMP(3);
