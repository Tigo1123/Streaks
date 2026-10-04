ALTER TABLE users
  ADD COLUMN google_sub TEXT,
  ADD COLUMN display_name TEXT,
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_google_sub_unique UNIQUE (google_sub);

ALTER TABLE users
  ADD CONSTRAINT users_auth_method_required
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
