-- Drop terminal role: PCs are interchangeable; name-only identification.

DROP INDEX IF EXISTS "RestaurantTerminal_restaurantId_role_idx";

ALTER TABLE "RestaurantTerminal" DROP COLUMN IF EXISTS "role";

DROP TYPE IF EXISTS "TerminalRole";
