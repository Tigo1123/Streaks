const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");
const { mapPreferences, rejectUnknown, requireObject } = require("../utils/data");

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
    "SELECT language, reminders_enabled FROM preferences WHERE user_id = $1",
    [userId]
  );
  if (!result.rowCount) throw new ApiError(404, "Not found");
  return result.rows[0];
}

router.get("/", async (req, res) => {
  return res.json({ preferences: mapPreferences(await ensurePreferences(req.user.id)) });
});

router.patch("/", async (req, res) => {
  const body = requireObject(req.body);
  rejectUnknown(body, ["language", "remindersEnabled"]);
  const hasLanguage = Object.hasOwn(body, "language");
  const hasReminders = Object.hasOwn(body, "remindersEnabled");
  if (!hasLanguage && !hasReminders) throw new ApiError(400, "At least one preference is required");
  if (hasLanguage && !["en", "ar"].includes(body.language)) {
    throw new ApiError(400, "language must be 'en' or 'ar'");
  }
  if (hasReminders && typeof body.remindersEnabled !== "boolean") {
    throw new ApiError(400, "remindersEnabled must be a boolean");
  }

  let result;
  if (hasLanguage && hasReminders) {
    result = await pool.query(
      `INSERT INTO preferences (user_id, language, reminders_enabled)
       SELECT id, $2, $3 FROM users WHERE id = $1
       ON CONFLICT (user_id) DO UPDATE
       SET language = EXCLUDED.language, reminders_enabled = EXCLUDED.reminders_enabled
       RETURNING language, reminders_enabled`,
      [req.user.id, body.language, body.remindersEnabled]
    );
  } else if (hasLanguage) {
    result = await pool.query(
      `INSERT INTO preferences (user_id, language)
       SELECT id, $2 FROM users WHERE id = $1
       ON CONFLICT (user_id) DO UPDATE SET language = EXCLUDED.language
       RETURNING language, reminders_enabled`,
      [req.user.id, body.language]
    );
  } else {
    result = await pool.query(
      `INSERT INTO preferences (user_id, reminders_enabled)
       SELECT id, $2 FROM users WHERE id = $1
       ON CONFLICT (user_id) DO UPDATE SET reminders_enabled = EXCLUDED.reminders_enabled
       RETURNING language, reminders_enabled`,
      [req.user.id, body.remindersEnabled]
    );
  }
  if (!result.rowCount) throw new ApiError(404, "Not found");
  return res.json({ preferences: mapPreferences(result.rows[0]) });
});

module.exports = router;
