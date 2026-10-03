const test = require("node:test");
const assert = require("node:assert/strict");

test("database pool enforces TLS and uses DATABASE_CA_CERT without connecting", () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/streaks_test";
  process.env.JWT_SECRET = "database-ca-test-secret-at-least-32-bytes";
  process.env.CORS_ORIGIN = "http://localhost:8080";

  const configuredCa = "-----BEGIN CERTIFICATE-----\nexample-ca\n-----END CERTIFICATE-----";
  process.env.DATABASE_CA_CERT = configuredCa;

  const pool = require("../src/db/pool");

  assert.equal(pool.options.ssl.rejectUnauthorized, true);
  assert.equal(pool.options.ssl.ca, configuredCa);
  assert.equal(pool.totalCount, 0, "Loading pool options must not open a database connection");

  delete process.env.DATABASE_CA_CERT;
  return pool.end();
});
