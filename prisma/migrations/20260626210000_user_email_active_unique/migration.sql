-- Soft-delete duplicate active users (keep oldest per email, case-insensitive).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email)
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "User"
  WHERE "deletedAt" IS NULL
)
UPDATE "User" AS u
SET
  "deletedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked AS r
WHERE u.id = r.id
  AND r.rn > 1;

-- Enforce one active account per email (case-insensitive).
CREATE UNIQUE INDEX "User_email_active_lower_key"
  ON "User" (LOWER(email))
  WHERE "deletedAt" IS NULL;
