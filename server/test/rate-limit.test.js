const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/streaks_test";
process.env.JWT_SECRET = "rate-limit-test-secret-at-least-32-bytes";
process.env.CORS_ORIGIN = "http://localhost:8080";

const app = require("../src/app");
const pool = require("../src/db/pool");

test("auth rate limits use forwarded client IPs and reject with a generic response without DB access", async (t) => {
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
  const postInvalid = (path, forwardedFor) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": forwardedFor
    },
    body: JSON.stringify({})
  });

  assert.equal(app.get("trust proxy"), 1);

  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await postInvalid("/api/auth/login", "198.51.100.10");
    assert.equal(response.status, 400);
  }
  const loginLimited = await postInvalid("/api/auth/login", "198.51.100.10");
  assert.equal(loginLimited.status, 429);
  assert.deepEqual(await loginLimited.json(), {
    error: "Too many requests. Please try again later."
  });

  const otherLoginIp = await postInvalid("/api/auth/login", "198.51.100.11");
  assert.equal(otherLoginIp.status, 400, "A different forwarded IP must have a separate login counter");
  assert.equal((await postInvalid("/api/auth/login", "198.51.100.10")).status, 429);

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await postInvalid("/api/auth/register", "203.0.113.10");
    assert.equal(response.status, 400);
  }
  const registerLimited = await postInvalid("/api/auth/register", "203.0.113.10");
  assert.equal(registerLimited.status, 429);
  assert.deepEqual(await registerLimited.json(), {
    error: "Too many requests. Please try again later."
  });
  assert.equal((await postInvalid("/api/auth/register", "203.0.113.11")).status, 400);

  assert.equal(pool.totalCount, 0, "Invalid request bodies must be rejected before opening a DB connection");
});
