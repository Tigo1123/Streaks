const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { mapChallenge, mapCompletion, mapNote, mapPreferences } = require("../utils/data");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const challengeRows = await client.query(
      `SELECT id, title, description, duration, start_date, created_at, updated_at
       FROM challenges WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
      [req.user.id]
    );
    const completionRows = await client.query(
      `SELECT c.id, c.challenge_id, c.completion_date, c.completed_at, c.created_at, c.updated_at
       FROM completions AS c JOIN challenges AS ch ON ch.id = c.challenge_id
       WHERE ch.user_id = $1 ORDER BY c.challenge_id, c.completion_date`,
      [req.user.id]
    );
    const noteRows = await client.query(
      `SELECT n.id, n.challenge_id, n.content, n.created_at, n.updated_at
       FROM notes AS n JOIN challenges AS ch ON ch.id = n.challenge_id
       WHERE ch.user_id = $1 ORDER BY n.challenge_id`,
      [req.user.id]
    );
    const preferenceRows = await client.query(
      `SELECT language, reminders_enabled, updated_at FROM preferences WHERE user_id = $1`,
      [req.user.id]
    );
    const tombstoneRows = await client.query(
      `SELECT entity_type, entity_key, deleted_at FROM sync_tombstones
       WHERE user_id = $1 ORDER BY deleted_at, entity_type, entity_key`,
      [req.user.id]
    );
    await client.query("COMMIT");
    res.set("Cache-Control", "no-store");
    return res.json({
      challenges: challengeRows.rows.map(mapChallenge),
      completions: completionRows.rows.map((row) => ({
        challengeId: row.challenge_id,
        ...mapCompletion(row)
      })),
      notes: noteRows.rows.map((row) => ({ challengeId: row.challenge_id, note: mapNote(row) })),
      preferences: preferenceRows.rowCount
        ? { ...mapPreferences(preferenceRows.rows[0]), updatedAt: new Date(preferenceRows.rows[0].updated_at).toISOString() }
        : { language: "en", remindersEnabled: false, updatedAt: null },
      tombstones: tombstoneRows.rows.map((row) => ({
        entityType: row.entity_type,
        entityKey: row.entity_key,
        deletedAt: new Date(row.deleted_at).toISOString()
      }))
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

module.exports = router;
