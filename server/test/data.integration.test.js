const test = require("node:test");
const assert = require("node:assert/strict");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("cloud data API integration and ownership (requires TEST_DATABASE_URL)", {
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
  const request = (path, { method = "GET", token, body, headers: extraHeaders = {} } = {}) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...extraHeaders
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const register = async (email) => {
    const response = await request("/api/auth/register", {
      method: "POST", body: { email, password: "integration-password" }
    });
    assert.equal(response.status, 201);
    return (await response.json()).user;
  };
  const login = async (email) => {
    const response = await request("/api/auth/login", {
      method: "POST", body: { email, password: "integration-password" }
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  };

  const userA = await register("owner.a@example.com");
  const userB = await register("owner.b@example.com");
  const tokenA = await login(userA.email);
  const tokenB = await login(userB.email);
  const today = new Date().toISOString().slice(0, 10);
  const validChallenge = (title) => ({ title, description: "Daily practice", duration: 30, startDate: today });
  let challengeA;
  let challengeB;

  await t.test("all data routes reject requests without authentication", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const routes = [
      ["GET", "/api/challenges"], ["POST", "/api/challenges"],
      ["GET", `/api/challenges/${id}`], ["PATCH", `/api/challenges/${id}`], ["DELETE", `/api/challenges/${id}`],
      ["GET", `/api/challenges/${id}/completions`], ["POST", `/api/challenges/${id}/completions`],
      ["DELETE", `/api/challenges/${id}/completions/${today}`],
      ["GET", `/api/challenges/${id}/notes`], ["PUT", `/api/challenges/${id}/notes`], ["DELETE", `/api/challenges/${id}/notes`],
      ["GET", "/api/preferences"], ["PATCH", "/api/preferences"], ["GET", "/api/sync"]
    ];
    for (const [method, path] of routes) {
      const response = await request(path, { method, body: method === "GET" || method === "DELETE" ? undefined : {} });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
    const malformed = await request("/api/challenges", { token: "not-a-jwt" });
    const expiredToken = jwt.sign({}, process.env.JWT_SECRET, {
      subject: userA.id, expiresIn: -1, algorithm: "HS256"
    });
    const expired = await request("/api/preferences", { token: expiredToken });
    assert.equal(malformed.status, 401);
    assert.equal(expired.status, 401);
  });

  await t.test("challenge CRUD, validation, and strict two-user ownership", async () => {
    const invalid = await request("/api/challenges", { method: "POST", token: tokenA, body: { ...validChallenge(" ") } });
    assert.equal(invalid.status, 400);
    const unknownField = await request("/api/challenges", {
      method: "POST", token: tokenA, body: { ...validChallenge("A"), userId: userB.id }
    });
    assert.equal(unknownField.status, 400);
    const badDuration = await request("/api/challenges", {
      method: "POST", token: tokenA, body: { ...validChallenge("A"), duration: 0 }
    });
    assert.equal(badDuration.status, 400);
    const badDate = await request("/api/challenges", {
      method: "POST", token: tokenA, body: { ...validChallenge("A"), startDate: "2026-02-30" }
    });
    assert.equal(badDate.status, 400);

    let response = await request("/api/challenges", { method: "POST", token: tokenA, body: validChallenge("A: Reading") });
    assert.equal(response.status, 201);
    challengeA = (await response.json()).challenge;
    assert.equal(challengeA.title, "A: Reading");
    assert.equal("userId" in challengeA, false);
    response = await request("/api/challenges", { method: "POST", token: tokenB, body: validChallenge("B: Exercise") });
    assert.equal(response.status, 201);
    challengeB = (await response.json()).challenge;

    response = await request("/api/challenges", { token: tokenA });
    assert.deepEqual((await response.json()).challenges.map((item) => item.id), [challengeA.id]);
    response = await request("/api/challenges", { token: tokenB });
    assert.deepEqual((await response.json()).challenges.map((item) => item.id), [challengeB.id]);
    assert.equal((await request(`/api/challenges/${challengeA.id}`, { token: tokenA })).status, 200);
    assert.equal((await request(`/api/challenges/${challengeB.id}`, { token: tokenA })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeA.id}`, { token: tokenB })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeB.id}`, { token: tokenB })).status, 200);

    response = await request(`/api/challenges/${challengeA.id}`, {
      method: "PATCH", token: tokenA, body: { title: "  A: Updated  " }
    });
    assert.equal(response.status, 200);
    const firstVersion = (await response.json()).challenge.updatedAt;
    assert.equal((await request(`/api/challenges/${challengeA.id}`, {
      method: "PATCH", token: tokenA, body: { title: "A: Newer" }, headers: { "if-match": firstVersion }
    })).status, 200);
    assert.equal((await request(`/api/challenges/${challengeA.id}`, {
      method: "PATCH", token: tokenA, body: { title: "Stale overwrite" }, headers: { "if-match": firstVersion }
    })).status, 409);
    assert.equal((await request(`/api/challenges/${challengeA.id}`, {
      method: "PATCH", token: tokenB, body: { title: "stolen" }
    })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeB.id}`, {
      method: "PATCH", token: tokenA, body: { title: "stolen" }
    })).status, 404);
    response = await request(`/api/challenges/${challengeB.id}`, {
      method: "PATCH", token: tokenB, body: { title: "B: Updated" }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).challenge.title, "B: Updated");
    assert.equal((await request(`/api/challenges/${challengeA.id}`, {
      method: "PATCH", token: tokenA, body: { userId: userB.id }
    })).status, 400);
    assert.equal((await request(`/api/challenges/${challengeA.id}`, {
      method: "PATCH", token: tokenA, body: { duration: 366 }
    })).status, 400);
    assert.equal((await request(`/api/challenges/${challengeA.id}`, {
      method: "DELETE", token: tokenB
    })).status, 404);
  });

  await t.test("completion date rules, duplicates, and ownership", async () => {
    let response = await request(`/api/challenges/${challengeA.id}/completions`, { token: tokenA });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).completions, []);
    response = await request(`/api/challenges/${challengeA.id}/completions`, {
      method: "POST", token: tokenA, body: { completionDate: today }
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).completion.completionDate, today);
    const duplicate = await request(`/api/challenges/${challengeA.id}/completions`, {
      method: "POST", token: tokenA, body: { completionDate: today }
    });
    assert.equal(duplicate.status, 409);
    const future = new Date(`${today}T00:00:00.000Z`);
    future.setUTCDate(future.getUTCDate() + 1);
    const futureResponse = await request(`/api/challenges/${challengeA.id}/completions`, {
      method: "POST", token: tokenA, body: { completionDate: future.toISOString().slice(0, 10) }
    });
    assert.equal(futureResponse.status, 400);
    assert.equal((await request(`/api/challenges/${challengeA.id}/completions`, {
      method: "POST", token: tokenA, body: { completionDate: "2026-02-30" }
    })).status, 400);
    const incompatibleSchedule = await request(`/api/challenges/${challengeA.id}`, {
      method: "PATCH", token: tokenA, body: { startDate: "2026-01-01", duration: 1 }
    });
    assert.equal(incompatibleSchedule.status, 409);

    assert.equal((await request(`/api/challenges/${challengeB.id}/completions`, {
      method: "POST", token: tokenA, body: { completionDate: today }
    })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeA.id}/completions`, { token: tokenB })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeA.id}/completions/${today}`, {
      method: "DELETE", token: tokenB
    })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeA.id}/completions/${today}`, {
      method: "DELETE", token: tokenA
    })).status, 204);
    const missing = await request(`/api/challenges/${challengeA.id}/completions/${today}`, {
      method: "DELETE", token: tokenA
    });
    assert.equal(missing.status, 204);
    const deletedCompletion = await request("/api/sync", { token: tokenA });
    assert.equal(deletedCompletion.status, 200);
    const completionTombstone = (await deletedCompletion.json()).tombstones.find((entry) => entry.entityType === "completion");
    assert.equal(completionTombstone.entityKey, `${challengeA.id}|${today}`);
    assert.equal((await request("/api/sync", { token: tokenB })).headers.get("cache-control"), "no-store");
    const bCompletion = await request(`/api/challenges/${challengeB.id}/completions`, {
      method: "POST", token: tokenB, body: { completionDate: today }
    });
    assert.equal(bCompletion.status, 201);
    assert.equal((await request(`/api/challenges/${challengeB.id}/completions`, { token: tokenA })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeB.id}/completions/${today}`, {
      method: "DELETE", token: tokenA
    })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeB.id}/completions`, { token: tokenB })).status, 200);
    assert.equal((await request(`/api/challenges/${challengeB.id}/completions/${today}`, {
      method: "DELETE", token: tokenB
    })).status, 204);
  });

  await t.test("challenge migration keys make retries idempotent and user-scoped", async () => {
    const migrationKey = "a37c3a5a-8fae-4bdb-9f6d-6c896aab3ef8";
    const first = await request("/api/challenges", {
      method: "POST", token: tokenA,
      body: { ...validChallenge("Migrated once"), migrationKey }
    });
    assert.equal(first.status, 201);
    const firstChallenge = (await first.json()).challenge;
    const retry = await request("/api/challenges", {
      method: "POST", token: tokenA,
      body: { ...validChallenge("Should not duplicate"), migrationKey }
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).challenge.id, firstChallenge.id);
    assert.equal((await request("/api/challenges", { token: tokenA })).status, 200);
    const countA = await pool.query("SELECT count(*)::int AS count FROM challenges WHERE user_id = $1 AND migration_key = $2", [userA.id, migrationKey]);
    assert.equal(countA.rows[0].count, 1);
    const sameKeyForB = await request("/api/challenges", {
      method: "POST", token: tokenB,
      body: { ...validChallenge("B's independent migration"), migrationKey }
    });
    assert.equal(sameKeyForB.status, 201);
    const bMigrationChallenge = (await sameKeyForB.json()).challenge;
    assert.notEqual(bMigrationChallenge.id, firstChallenge.id);
    const invalidKey = await request("/api/challenges", {
      method: "POST", token: tokenA,
      body: { ...validChallenge("Invalid key"), migrationKey: "not-a-uuid" }
    });
    assert.equal(invalidKey.status, 400);
    assert.equal((await request(`/api/challenges/${firstChallenge.id}`, { method: "DELETE", token: tokenA })).status, 204);
    assert.equal((await request(`/api/challenges/${bMigrationChallenge.id}`, { method: "DELETE", token: tokenB })).status, 204);
  });

  await t.test("notes are unique per challenge and ownership is enforced", async () => {
    let response = await request(`/api/challenges/${challengeA.id}/notes`, { token: tokenA });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { note: null });
    response = await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "PUT", token: tokenA, body: { content: "A's note" }
    });
    assert.equal(response.status, 200);
    const noteId = (await response.json()).note.id;
    response = await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "PUT", token: tokenA, body: { content: "Updated note" }
    });
    assert.equal((await response.json()).note.id, noteId);
    const createConditional = await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "PUT", token: tokenA, body: { content: "conditional create" }, headers: { "if-none-match": "*" }
    });
    assert.equal(createConditional.status, 409);
    const noteVersion = (await (await request(`/api/challenges/${challengeA.id}/notes`, { token: tokenA })).json()).note.updatedAt;
    assert.equal((await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "PUT", token: tokenA, body: { content: "conditional update" }, headers: { "if-match": noteVersion }
    })).status, 200);
    assert.equal((await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "PUT", token: tokenA, body: { content: "stale note overwrite" }, headers: { "if-match": noteVersion }
    })).status, 409);
    assert.equal((await request(`/api/challenges/${challengeB.id}/notes`, {
      method: "PUT", token: tokenA, body: { content: "cross-user" }
    })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeA.id}/notes`, { token: tokenB })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "DELETE", token: tokenB
    })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "PUT", token: tokenA, body: { content: "x".repeat(1001) }
    })).status, 400);
    assert.equal((await request(`/api/challenges/${challengeA.id}/notes`, {
      method: "DELETE", token: tokenA
    })).status, 204);
    assert.deepEqual(await (await request(`/api/challenges/${challengeA.id}/notes`, { token: tokenA })).json(), { note: null });
    assert.equal((await request(`/api/challenges/${challengeB.id}/notes`, {
      method: "PUT", token: tokenB, body: { content: "B's note" }
    })).status, 200);
    assert.equal((await request(`/api/challenges/${challengeB.id}/notes`, { token: tokenA })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeB.id}/notes`, {
      method: "DELETE", token: tokenA
    })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeB.id}/notes`, { token: tokenB })).status, 200);
    assert.equal((await request(`/api/challenges/${challengeB.id}/notes`, {
      method: "DELETE", token: tokenB
    })).status, 204);
  });

  await t.test("preferences return per-user defaults and accept only supported fields", async () => {
    let response = await request("/api/preferences", { token: tokenA });
    assert.deepEqual(await response.json(), { preferences: { language: "en", remindersEnabled: false } });
    response = await request("/api/preferences", {
      method: "PATCH", token: tokenA, body: { language: "ar", remindersEnabled: true }
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).preferences, { language: "ar", remindersEnabled: true });
    assert.deepEqual(await (await request("/api/preferences", { token: tokenB })).json(), {
      preferences: { language: "en", remindersEnabled: false }
    });
    assert.equal((await request("/api/preferences", {
      method: "PATCH", token: tokenA, body: { language: "fr" }
    })).status, 400);
    assert.equal((await request("/api/preferences", {
      method: "PATCH", token: tokenA, body: { remindersEnabled: "true" }
    })).status, 400);
    assert.equal((await request("/api/preferences", {
      method: "PATCH", token: tokenA, body: { userId: userB.id }
    })).status, 400);
    assert.equal((await request("/api/preferences", {
      method: "PATCH", token: tokenA, body: {}
    })).status, 400);
  });

  await t.test("sync snapshot is authenticated, user-scoped, and includes tombstones", async () => {
    const response = await request("/api/sync", { token: tokenA });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const snapshot = await response.json();
    assert.deepEqual(snapshot.challenges.map((challenge) => challenge.id), [challengeA.id]);
    assert.equal(snapshot.completions.some((completion) => completion.challengeId === challengeB.id), false);
    assert.equal(snapshot.tombstones.some((entry) => entry.entityKey === `${challengeA.id}|${today}`), true);
    assert.equal(snapshot.preferences.language, "ar");
    assert.equal(typeof snapshot.preferences.updatedAt, "string");
    const other = await (await request("/api/sync", { token: tokenB })).json();
    assert.deepEqual(other.challenges.map((challenge) => challenge.id), [challengeB.id]);
    assert.equal(other.tombstones.some((entry) => entry.entityKey.includes(challengeA.id)), false);
  });

  await t.test("deleting a user's challenge cascades only that user's related data", async () => {
    const insertNote = await pool.query("INSERT INTO notes (challenge_id, content) VALUES ($1, $2) RETURNING id", [challengeA.id, "cascade"]);
    assert.equal(insertNote.rowCount, 1);
    const deleted = await request(`/api/challenges/${challengeA.id}`, { method: "DELETE", token: tokenA });
    assert.equal(deleted.status, 204);
    const remainingA = await pool.query("SELECT count(*)::int AS count FROM challenges WHERE user_id = $1", [userA.id]);
    const remainingB = await pool.query("SELECT count(*)::int AS count FROM challenges WHERE user_id = $1", [userB.id]);
    const cascaded = await pool.query("SELECT count(*)::int AS count FROM notes WHERE challenge_id = $1", [challengeA.id]);
    assert.equal(remainingA.rows[0].count, 0);
    assert.equal(remainingB.rows[0].count, 1);
    assert.equal(cascaded.rows[0].count, 0);
    assert.equal((await request(`/api/challenges/${challengeA.id}`, { method: "DELETE", token: tokenA })).status, 204);
    const snapshot = await (await request("/api/sync", { token: tokenA })).json();
    assert.equal(snapshot.tombstones.some((entry) => entry.entityType === "challenge" && entry.entityKey === challengeA.id), true);
    assert.equal((await request(`/api/challenges/${challengeB.id}`, { method: "DELETE", token: tokenA })).status, 404);
    assert.equal((await request(`/api/challenges/${challengeB.id}`, { method: "DELETE", token: tokenB })).status, 204);
  });
});
