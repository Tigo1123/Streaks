CREATE TABLE IF NOT EXISTS sync_tombstones (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sync_tombstones_type_valid CHECK (entity_type IN ('challenge', 'completion')),
  CONSTRAINT sync_tombstones_key_nonempty CHECK (length(entity_key) BETWEEN 1 AND 100),
  PRIMARY KEY (user_id, entity_type, entity_key)
);

CREATE INDEX IF NOT EXISTS sync_tombstones_user_deleted_idx
  ON sync_tombstones (user_id, deleted_at);
