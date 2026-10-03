ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS migration_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS challenges_user_migration_key_unique
  ON challenges (user_id, migration_key)
  WHERE migration_key IS NOT NULL;
