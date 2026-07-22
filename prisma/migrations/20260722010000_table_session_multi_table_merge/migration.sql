-- Unión de mesas: varias Table pueden apuntar a la misma TableSession.
DROP INDEX IF EXISTS "Table_currentSessionId_key";

CREATE INDEX IF NOT EXISTS "Table_currentSessionId_idx" ON "Table"("currentSessionId");
