CREATE TABLE auth_refresh_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX auth_refresh_sessions_user_id_idx ON auth_refresh_sessions(user_id);
CREATE INDEX auth_refresh_sessions_family_id_idx ON auth_refresh_sessions(family_id);
CREATE INDEX auth_refresh_sessions_expires_at_idx ON auth_refresh_sessions(expires_at);
