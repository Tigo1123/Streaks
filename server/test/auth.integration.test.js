const test = require("node:test");
const assert = require("node:assert/strict");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("authentication and schema integration (requires TEST_DATABASE_URL)", {
  skip: testDatabaseUrl ? false : "Set TEST_DATABASE_URL to a dedicated PostgreSQL database to run integration tests"
}, async (t) => {
  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  if (!/(^|[_-])test\d*($|[_-])/i.test(databaseName)) {
    throw new Error("Refusing to run destructive integration cleanup: TEST_DATABASE_URL database name must include 'test'");
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || "integration-test-secret-at-least-32-bytes-long";
  process.env.CORS_ORIGIN = "http://localhost:5500";

  const bcrypt = require("bcrypt");
  const { todayInZone } = require("../src/utils/timezone");
  const jwt = require("jsonwebtoken");
  const app = require("../src/app");
  const pool = require("../src/db/pool");
  const { runMigrations } = require("../src/db/migrate");

  await runMigrations();
  await pool.query("TRUNCATE users CASCADE");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const postJson = (path, body) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  await t.test("valid registration normalizes email and stores only a bcrypt hash", async () => {
    const response = await postJson("/api/auth/register", {
      email: "  Test.User@Example.com ",
      password: "correct horse battery"
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.user.email, "test.user@example.com");
    assert.equal("password_hash" in body.user, false);

    const stored = await pool.query("SELECT email, password_hash FROM users WHERE id = $1", [body.user.id]);
    assert.equal(stored.rows[0].email, "test.user@example.com");
    assert.notEqual(stored.rows[0].password_hash, "correct horse battery");
    assert.equal(await bcrypt.compare("correct horse battery", stored.rows[0].password_hash), true);
  });

  await t.test("invalid credentials and duplicate email are rejected", async () => {
    const badEmail = await postJson("/api/auth/register", { email: "not-an-email", password: "long-enough" });
    assert.equal(badEmail.status, 400);
    const shortPassword = await postJson("/api/auth/register", { email: "short@example.com", password: "1234567" });
    assert.equal(shortPassword.status, 400);
    const duplicate = await postJson("/api/auth/register", { email: "TEST.USER@example.com", password: "another password" });
    assert.equal(duplicate.status, 409);
  });

  await t.test("login returns a minimal JWT and rejects incorrect credentials uniformly", async () => {
    const invalid = await postJson("/api/auth/login", { email: "test.user@example.com", password: "incorrect password" });
    assert.equal(invalid.status, 401);
    const unknown = await postJson("/api/auth/login", { email: "missing.user@example.com", password: "incorrect password" });
    assert.equal(unknown.status, 401);
    assert.deepEqual(await unknown.json(), await invalid.json());
    const response = await postJson("/api/auth/login", { email: "TEST.USER@example.com", password: "correct horse battery" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.token, "string");
    const claims = jwt.decode(body.token);
    assert.equal(claims.sub, body.user.id);
    assert.equal("email" in claims, false);
    assert.equal("password" in claims, false);
    assert.equal("password_hash" in claims, false);
  });

  await t.test("/me requires a valid, non-expired bearer token and returns safe data", async () => {
    const login = await postJson("/api/auth/login", { email: "test.user@example.com", password: "correct horse battery" });
    const { token, user } = await login.json();
    const missing = await fetch(`${baseUrl}/api/auth/me`);
    const invalid = await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: "Bearer invalid" } });
    const expiredToken = jwt.sign({}, process.env.JWT_SECRET, { subject: user.id, expiresIn: -1, algorithm: "HS256" });
    const expired = await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${expiredToken}` } });
    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
    assert.equal(expired.status, 401);

    const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.user).sort(), ["createdAt", "email", "id", "timezone"]);
    assert.equal(body.user.timezone, null);
    assert.equal(body.time.today, todayInZone(null, new Date(body.time.serverNow)));
  });

  await t.test("schema constraints and cascades are enforced", async () => {
    const user = await pool.query("SELECT id FROM users WHERE email = $1", ["test.user@example.com"]);
    const userId = user.rows[0].id;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1::text[])`,
      [["users", "challenges", "completions", "notes", "preferences", "sync_tombstones"]]
    );
    assert.equal(tables.rowCount, 6);

    const challenge = await pool.query(
      `INSERT INTO challenges (user_id, title, duration, start_date)
       VALUES ($1, $2, $3, CURRENT_DATE) RETURNING id`,
      [userId, "Read", 30]
    );
    const challengeId = challenge.rows[0].id;
    await pool.query("INSERT INTO completions (challenge_id, completion_date) VALUES ($1, CURRENT_DATE)", [challengeId]);
    await assert.rejects(
      pool.query("INSERT INTO completions (challenge_id, completion_date) VALUES ($1, CURRENT_DATE)", [challengeId]),
      (error) => error.code === "23505"
    );
    await assert.rejects(
      pool.query("INSERT INTO challenges (user_id, title, duration, start_date) VALUES ($1, $2, $3, CURRENT_DATE)", ["00000000-0000-4000-8000-000000000000", "Orphan", 7]),
      (error) => error.code === "23503"
    );

    await pool.query("INSERT INTO notes (challenge_id, content) VALUES ($1, $2)", [challengeId, "A note"]);
    const preferences = await pool.query("SELECT language, reminders_enabled FROM preferences WHERE user_id = $1", [userId]);
    assert.deepEqual(preferences.rows[0], { language: "en", reminders_enabled: false });
    await assert.rejects(
      pool.query("INSERT INTO preferences (user_id) VALUES ($1)", [userId]),
      (error) => error.code === "23505"
    );
    await assert.rejects(
      pool.query("UPDATE preferences SET language = 'fr' WHERE user_id = $1", [userId]),
      (error) => error.code === "23514"
    );
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    for (const table of ["challenges", "completions", "notes", "preferences", "sync_tombstones"]) {
      const remaining = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
      assert.equal(remaining.rows[0].count, 0, `${table} should cascade when its user is deleted`);
    }
  });
});
