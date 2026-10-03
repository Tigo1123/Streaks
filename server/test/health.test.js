const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/streaks_test";
process.env.JWT_SECRET = "health-test-secret-that-is-at-least-32-bytes-long";
process.env.CORS_ORIGIN = "http://localhost:8080";

const app = require("../src/app");
const pool = require("../src/db/pool");

test("GET /api/health returns the API health response", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, {
    headers: { origin: "http://localhost:8080" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:8080");
  assert.deepEqual(await response.json(), { status: "ok" });
});
