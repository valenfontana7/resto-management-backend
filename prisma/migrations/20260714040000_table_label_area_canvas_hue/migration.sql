-- AlterTable: etiqueta amigable por mesa
ALTER TABLE "Table" ADD COLUMN "label" TEXT;

-- AlterTable: tono de lienzo por área
ALTER TABLE "TableArea" ADD COLUMN "canvasHue" INTEGER;
