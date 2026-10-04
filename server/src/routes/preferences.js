const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");
const { mapPreferences, rejectUnknown, requireObject } = require("../utils/data");
const { isValidTimezone, timeContext } = require("../utils/timezone");

const router = express.Router();
router.use(requireAuth);

async function ensurePreferences(userId) {
  await pool.query(
    `INSERT INTO preferences (user_id)
     SELECT id FROM users WHERE id = $1
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const result = await pool.query(
    `SELECT p.language, u.timezone
     FROM preferences AS p JOIN users AS u ON u.id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );
  if (!result.rowCount) throw new ApiError(404, "Not found");
  return result.rows[0];
}

router.get("/", async (req, res) => {
  const preferences = await ensurePreferences(req.user.id);
  return res.json({
    preferences: mapPreferences(preferences),
    time: timeContext(preferences.timezone)
  });
});

router.patch("/", async (req, res) => {
  const body = requireObject(req.body);
  rejectUnknown(body, ["language", "timezone"]);
  const hasLanguage = Object.hasOwn(body, "language");
  const hasTimezone = Object.hasOwn(body, "timezone");
  if (!hasLanguage && !hasTimezone) throw new ApiError(400, "At least one preference is required");
  if (hasLanguage && !["en", "ar"].includes(body.language)) {
    throw new ApiError(400, "language must be 'en' or 'ar'");
  }
  if (hasTimezone && body.timezone !== null && !isValidTimezone(body.timezone)) {
    throw new ApiError(400, "timezone must be a valid IANA timezone or null");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (hasTimezone) {
      await client.query("UPDATE users SET timezone = $2 WHERE id = $1", [req.user.id, body.timezone]);
    }
    await client.query(
      `INSERT INTO preferences (user_id, language)
       SELECT id, $2 FROM users WHERE id = $1
       ON CONFLICT (user_id) DO UPDATE SET
         language = CASE WHEN $3 THEN EXCLUDED.language ELSE preferences.language END`,
      [
        req.user.id,
        hasLanguage ? body.language : "en",
        hasLanguage
      ]
    );
    const result = await client.query(
      `SELECT p.language, u.timezone
       FROM preferences AS p JOIN users AS u ON u.id = p.user_id
       WHERE p.user_id = $1`,
      [req.user.id]
    );
    if (!result.rowCount) throw new ApiError(404, "Not found");
    await client.query("COMMIT");
    return res.json({
      preferences: mapPreferences(result.rows[0]),
      time: timeContext(result.rows[0].timezone)
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

module.exports = router;
