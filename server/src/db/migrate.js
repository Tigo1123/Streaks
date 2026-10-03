const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("./pool");

const migrationsPath = path.join(__dirname, "migrations");
const migrationLockName = "streaks-schema-migrations";

async function runMigrations() {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [migrationLockName]);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await fs.readdir(migrationsPath))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
      .sort();

    for (const name of files) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [name]
      );
      if (existing.rowCount > 0) continue;

      const sql = await fs.readFile(path.join(migrationsPath, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.log(`Applied migration ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [migrationLockName]);
      } catch (error) {
        console.error("Could not release the migration lock:", error.message);
      }
    }
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .catch((error) => {
      console.error("Database migration failed:", error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { runMigrations };
