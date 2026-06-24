-- Backfill tokens for legacy reservations (close IDOR via UUID)
UPDATE "Reservation"
SET "publicAccessToken" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "publicAccessToken" IS NULL OR trim("publicAccessToken") = '';
