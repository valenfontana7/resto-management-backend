-- Multi-cuenta por usuario: tabla pivote de acceso usuario <-> restaurante.
-- Aditiva y retrocompatible: User.restaurantId/roleId siguen siendo el
-- "restaurante activo"; esta tabla define a qué restaurantes puede cambiar.

CREATE TABLE IF NOT EXISTS "RestaurantMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "roleId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RestaurantMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantMembership_userId_restaurantId_key"
  ON "RestaurantMembership"("userId", "restaurantId");
CREATE INDEX IF NOT EXISTS "RestaurantMembership_userId_idx"
  ON "RestaurantMembership"("userId");
CREATE INDEX IF NOT EXISTS "RestaurantMembership_restaurantId_idx"
  ON "RestaurantMembership"("restaurantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RestaurantMembership_userId_fkey'
  ) THEN
    ALTER TABLE "RestaurantMembership"
      ADD CONSTRAINT "RestaurantMembership_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RestaurantMembership_restaurantId_fkey'
  ) THEN
    ALTER TABLE "RestaurantMembership"
      ADD CONSTRAINT "RestaurantMembership_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RestaurantMembership_roleId_fkey'
  ) THEN
    ALTER TABLE "RestaurantMembership"
      ADD CONSTRAINT "RestaurantMembership_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: cada usuario activo con restaurante asignado obtiene su membership
-- inicial marcado como predeterminado.
INSERT INTO "RestaurantMembership" ("id", "userId", "restaurantId", "roleId", "isDefault", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."restaurantId",
  u."roleId",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."restaurantId" IS NOT NULL
  AND u."deletedAt" IS NULL
ON CONFLICT ("userId", "restaurantId") DO NOTHING;
