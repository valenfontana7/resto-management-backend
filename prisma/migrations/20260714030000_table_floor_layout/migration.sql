-- AlterTable: layout extendido del plano de mesas
ALTER TABLE "Table" ADD COLUMN "widthPct" DOUBLE PRECISION NOT NULL DEFAULT 10;
ALTER TABLE "Table" ADD COLUMN "heightPct" DOUBLE PRECISION NOT NULL DEFAULT 10;
ALTER TABLE "Table" ADD COLUMN "rotationDeg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Table" ADD COLUMN "accentHue" INTEGER;

-- Rectángulos un poco más anchos por defecto
UPDATE "Table" SET "widthPct" = 14, "heightPct" = 9 WHERE "shape" = 'RECTANGLE';
