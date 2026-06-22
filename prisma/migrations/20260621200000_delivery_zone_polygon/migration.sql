-- Zonas de delivery: polígonos geográficos para mapa admin
ALTER TABLE "DeliveryZone" ADD COLUMN "polygon" JSONB;
