const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");
const {
  addDays,
  dateString,
  isValidDate,
  mapChallenge,
  mapCompletion,
  mapNote,
  rejectUnknown,
  requireObject,
  validateUuidParam
} = require("../utils/data");
const { todayInZone } = require("../utils/timezone");

const router = express.Router();
router.use(requireAuth);
router.param("id", (req, res, next, id) => {
  try {
    validateUuidParam(id);
    next();
  } catch (error) {
    next(error);
  }
});

const challengeColumns = `id, title, description, duration, start_date, created_at, updated_at`;

function validateTitle(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 160) {
    throw new ApiError(400, "Title is required and must be at most 160 characters");
  }
  return value.trim();
}

function validateDescription(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2000) {
    throw new ApiError(400, "Description must be a string of at most 2000 characters");
  }
  return value;
}

function validateDuration(value) {
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new ApiError(400, "Duration must be an integer from 1 to 365");
  }
  return value;
}

function validateDate(value, field) {
  if (!isValidDate(value)) throw new ApiError(400, `${field} must be a valid YYYY-MM-DD date`);
  return value;
}

async function getOwnedChallenge(db, id, userId, lock = false) {
  const result = await db.query(
    `SELECT id, duration, start_date, updated_at FROM challenges WHERE id = $1 AND user_id = $2${lock ? " FOR UPDATE" : ""}`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function inTransaction(operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function completionDateAllowed(challenge, completionDate, timezone, now = new Date()) {
  const startDate = dateString(challenge.start_date);
  const endDate = addDays(startDate, challenge.duration - 1);
  const latestAllowedDate = addDays(todayInZone(timezone, now), 1);
  return completionDate >= startDate && completionDate <= endDate && completionDate <= latestAllowedDate;
}

function challengeRangeContainsCompletions(startDate, duration, completionDates) {
  const endDate = addDays(startDate, duration - 1);
  return completionDates.every((date) => date >= startDate && date <= endDate);
}

function assertCompletionDate(challenge, completionDate, timezone, now = new Date()) {
  if (!completionDateAllowed(challenge, completionDate, timezone, now)) {
    throw new ApiError(400, "Completion date must be within this challenge and no later than tomorrow");
  }
}

router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT ${challengeColumns} FROM challenges WHERE user_id = $1 ORDER BY created_at DESC, id ASC`,
    [req.user.id]
  );
  return res.json({ challenges: result.rows.map(mapChallenge) });
});

router.post("/", async (req, res) => {
  const body = requireObject(req.body);
  rejectUnknown(body, ["title", "description", "duration", "startDate", "migrationKey"]);
  const title = validateTitle(body.title);
  const description = body.description === undefined ? null : validateDescription(body.description);
  const duration = validateDuration(body.duration);
  const startDate = validateDate(body.startDate, "startDate");
  const migrationKey = body.migrationKey;
  if (migrationKey !== undefined && (typeof migrationKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(migrationKey))) {
    throw new ApiError(400, "migrationKey must be a UUID");
  }

  if (migrationKey) {
    const result = await pool.query(
      `INSERT INTO challenges (user_id, title, description, duration, start_date, migration_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, migration_key) WHERE migration_key IS NOT NULL
       DO NOTHING
       RETURNING ${challengeColumns}`,
      [req.user.id, title, description, duration, startDate, migrationKey]
    );
    if (result.rowCount) return res.status(201).json({ challenge: mapChallenge(result.rows[0]) });
    const existing = await pool.query(
      `SELECT ${challengeColumns} FROM challenges WHERE user_id = $1 AND migration_key = $2`,
      [req.user.id, migrationKey]
    );
    if (!existing.rowCount) throw new ApiError(409, "Migration key conflict");
    return res.json({ challenge: mapChallenge(existing.rows[0]) });
  }

  const result = await pool.query(
    `INSERT INTO challenges (user_id, title, description, duration, start_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${challengeColumns}`,
    [req.user.id, title, description, duration, startDate]
  );
  return res.status(201).json({ challenge: mapChallenge(result.rows[0]) });
});

router.get("/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT ${challengeColumns} FROM challenges WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) throw new ApiError(404, "Not found");
  return res.json({ challenge: mapChallenge(result.rows[0]) });
});

router.patch("/:id", async (req, res) => {
  const body = requireObject(req.body);
  rejectUnknown(body, ["title", "description", "duration", "startDate"]);
  const fields = {};
  if (Object.hasOwn(body, "title")) fields.title = validateTitle(body.title);
  if (Object.hasOwn(body, "description")) fields.description = validateDescription(body.description);
  if (Object.hasOwn(body, "duration")) fields.duration = validateDuration(body.duration);
  if (Object.hasOwn(body, "startDate")) fields.start_date = validateDate(body.startDate, "startDate");
  if (!Object.keys(fields).length) throw new ApiError(400, "At least one mutable field is required");
  const expectedUpdatedAt = req.get("if-match");
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new ApiError(400, "If-Match must contain a valid challenge timestamp");
  }

  const updated = await inTransaction(async (client) => {
    const existing = await getOwnedChallenge(client, req.params.id, req.user.id, true);
    if (!existing) throw new ApiError(404, "Not found");
    if (expectedUpdatedAt && new Date(existing.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
      throw new ApiError(409, "Challenge changed since it was read");
    }
    const nextStartDate = fields.start_date || dateString(existing.start_date);
    const nextDuration = fields.duration || existing.duration;
    const completions = await client.query(
      `SELECT c.completion_date FROM completions AS c
       JOIN challenges AS ch ON ch.id = c.challenge_id
       WHERE ch.id = $1 AND ch.user_id = $2`,
      [existing.id, req.user.id]
    );
    if (!challengeRangeContainsCompletions(
      nextStartDate,
      nextDuration,
      completions.rows.map((row) => dateString(row.completion_date))
    )) {
      throw new ApiError(409, "Updated challenge dates would invalidate existing completions");
    }

    const values = [req.params.id, req.user.id];
    const assignments = [];
    for (const [field, value] of Object.entries(fields)) {
      values.push(value);
      assignments.push(`${field} = $${values.length}`);
    }
    const result = await client.query(
      `UPDATE challenges SET ${assignments.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING ${challengeColumns}`,
      values
    );
    if (!result.rowCount) throw new ApiError(404, "Not found");
    return result.rows[0];
  });
  return res.json({ challenge: mapChallenge(updated) });
});

router.delete("/:id", async (req, res) => {
  const expectedUpdatedAt = req.get("if-match");
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new ApiError(400, "If-Match must contain a valid challenge timestamp");
  }
  await inTransaction(async (client) => {
    const owned = await client.query(
      "SELECT id, updated_at FROM challenges WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [req.params.id, req.user.id]
    );
    if (!owned.rowCount) {
      const deleted = await client.query(
        "SELECT 1 FROM sync_tombstones WHERE user_id = $1 AND entity_type = 'challenge' AND entity_key = $2",
        [req.user.id, req.params.id]
      );
      if (deleted.rowCount) return;
      throw new ApiError(404, "Not found");
    }
    if (expectedUpdatedAt && new Date(owned.rows[0].updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
      throw new ApiError(409, "Challenge changed since it was read");
    }
    await client.query(
      `INSERT INTO sync_tombstones (user_id, entity_type, entity_key)
       VALUES ($1, 'challenge', $2)
       ON CONFLICT (user_id, entity_type, entity_key) DO UPDATE SET deleted_at = now()`,
      [req.user.id, req.params.id]
    );
    await client.query("DELETE FROM challenges WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  });
  return res.status(204).end();
});

router.get("/:id/completions", async (req, res) => {
  if (!await getOwnedChallenge(pool, req.params.id, req.user.id)) throw new ApiError(404, "Not found");
  const result = await pool.query(
    `SELECT c.id, c.completion_date, c.completed_at, c.created_at, c.updated_at
     FROM completions AS c
     JOIN challenges AS ch ON ch.id = c.challenge_id
     WHERE ch.id = $1 AND ch.user_id = $2
     ORDER BY c.completion_date ASC`,
    [req.params.id, req.user.id]
  );
  return res.json({ completions: result.rows.map(mapCompletion) });
});

router.post("/:id/completions", async (req, res) => {
  const body = requireObject(req.body);
  rejectUnknown(body, ["completionDate"]);
  const completionDate = validateDate(body.completionDate, "completionDate");
  const completion = await inTransaction(async (client) => {
    const challenge = await getOwnedChallenge(client, req.params.id, req.user.id, true);
    if (!challenge) throw new ApiError(404, "Not found");
    const user = await client.query("SELECT timezone FROM users WHERE id = $1", [req.user.id]);
    if (!user.rowCount) throw new ApiError(401, "Authentication required");
    assertCompletionDate(challenge, completionDate, user.rows[0].timezone);
    try {
      await client.query(
        `DELETE FROM sync_tombstones WHERE user_id = $1 AND entity_type = 'completion' AND entity_key = $2`,
        [req.user.id, `${challenge.id}|${completionDate}`]
      );
      const result = await client.query(
        `INSERT INTO completions (challenge_id, completion_date)
         SELECT ch.id, $2 FROM challenges AS ch WHERE ch.id = $1 AND ch.user_id = $3
         RETURNING id, completion_date, completed_at, created_at, updated_at`,
        [challenge.id, completionDate, req.user.id]
      );
      if (!result.rowCount) throw new ApiError(404, "Not found");
      return result.rows[0];
    } catch (error) {
      if (error.code === "23505" && error.constraint === "completions_challenge_date_unique") {
        throw new ApiError(409, "This challenge day is already completed");
      }
      throw error;
    }
  });
  return res.status(201).json({ completion: mapCompletion(completion) });
});

router.delete("/:id/completions/:date", async (req, res) => {
  if (!isValidDate(req.params.date)) throw new ApiError(400, "date must be a valid YYYY-MM-DD date");
  await inTransaction(async (client) => {
    const challenge = await getOwnedChallenge(client, req.params.id, req.user.id, true);
    if (!challenge) throw new ApiError(404, "Not found");
    await client.query(
      `INSERT INTO sync_tombstones (user_id, entity_type, entity_key)
       VALUES ($1, 'completion', $2)
       ON CONFLICT (user_id, entity_type, entity_key) DO UPDATE SET deleted_at = now()`,
      [req.user.id, `${challenge.id}|${req.params.date}`]
    );
    await client.query(
      `DELETE FROM completions WHERE challenge_id = $1 AND completion_date = $2`,
      [challenge.id, req.params.date]
    );
  });
  return res.status(204).end();
});

router.get("/:id/notes", async (req, res) => {
  if (!await getOwnedChallenge(pool, req.params.id, req.user.id)) throw new ApiError(404, "Not found");
  const result = await pool.query(
    `SELECT n.id, n.content, n.created_at, n.updated_at
     FROM notes AS n
     JOIN challenges AS ch ON ch.id = n.challenge_id
     WHERE ch.id = $1 AND ch.user_id = $2`,
    [req.params.id, req.user.id]
  );
  return res.json({ note: result.rowCount ? mapNote(result.rows[0]) : null });
});

router.put("/:id/notes", async (req, res) => {
  const body = requireObject(req.body);
  rejectUnknown(body, ["content"]);
  if (typeof body.content !== "string" || body.content.length > 1000) {
    throw new ApiError(400, "Note content must be a string of at most 1000 characters");
  }
  const expectedUpdatedAt = req.get("if-match");
  const requireAbsent = req.get("if-none-match") === "*";
  if (expectedUpdatedAt && requireAbsent) throw new ApiError(400, "Use one conditional note header");
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new ApiError(400, "If-Match must contain a valid note timestamp");
  const note = await inTransaction(async (client) => {
    const challenge = await getOwnedChallenge(client, req.params.id, req.user.id, true);
    if (!challenge) throw new ApiError(404, "Not found");
    const existing = await client.query("SELECT updated_at FROM notes WHERE challenge_id = $1 FOR UPDATE", [challenge.id]);
    if (expectedUpdatedAt && (!existing.rowCount || new Date(existing.rows[0].updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString())) {
      throw new ApiError(409, "Note changed since it was read");
    }
    if (requireAbsent && existing.rowCount) throw new ApiError(409, "Note changed since it was read");
    const result = await client.query(
      `INSERT INTO notes (challenge_id, content)
       VALUES ($1, $2)
       ON CONFLICT (challenge_id) DO UPDATE SET content = EXCLUDED.content
       RETURNING id, content, created_at, updated_at`,
      [challenge.id, body.content]
    );
    return result.rows[0];
  });
  return res.json({ note: mapNote(note) });
});

router.delete("/:id/notes", async (req, res) => {
  const expectedUpdatedAt = req.get("if-match");
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new ApiError(400, "If-Match must contain a valid note timestamp");
  await inTransaction(async (client) => {
    const challenge = await getOwnedChallenge(client, req.params.id, req.user.id, true);
    if (!challenge) throw new ApiError(404, "Not found");
    const existing = await client.query("SELECT updated_at FROM notes WHERE challenge_id = $1 FOR UPDATE", [challenge.id]);
    if (expectedUpdatedAt && (!existing.rowCount || new Date(existing.rows[0].updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString())) {
      throw new ApiError(409, "Note changed since it was read");
    }
    await client.query("DELETE FROM notes WHERE challenge_id = $1", [challenge.id]);
  });
  return res.status(204).end();
});

module.exports = router;
module.exports.completionDateAllowed = completionDateAllowed;
module.exports.challengeRangeContainsCompletions = challengeRangeContainsCompletions;
