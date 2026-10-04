const test = require("node:test");
const assert = require("node:assert/strict");
const { config, loadConfig } = require("../src/config/env");
const { createGoogleAuthHandler } = require("../src/routes/auth");

async function invoke(handler, body) {
  let status = 200;
  let payload;
  const response = {
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    }
  };

  try {
    await handler({ body }, response);
  } catch (error) {
    status = error.status || 500;
    payload = {
      error: error.message,
      ...(error.code ? { code: error.code } : {})
    };
  }
  return { status, payload };
}

function validIdentity(overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: "google-client-id",
    exp: Math.floor(Date.now() / 1000) + 3600,
    email_verified: true,
    sub: "google-subject-123",
    email: "person@example.com",
    ...overrides
  };
}

test("GOOGLE_CLIENT_ID is optional and normalized when configured", () => {
  const base = {
    DATABASE_URL: "postgres://localhost/streaks",
    JWT_SECRET: "integration-test-secret-at-least-32-bytes-long",
    CORS_ORIGIN: "https://streaks-p6f7.onrender.com"
  };
  assert.equal(loadConfig({ ...base, GOOGLE_CLIENT_ID: "" }).googleClientId, null);
  assert.equal(loadConfig({ ...base, GOOGLE_CLIENT_ID: " client-id " }).googleClientId, "client-id");
  assert.ok(loadConfig(base).corsOrigins.includes("https://streaks-p6f7.onrender.com"));
  assert.ok(config.corsOrigins.includes("https://streaks-p6f7.onrender.com"));
});

test("Google auth route returns 503 without configured client ID", async () => {
  const handler = createGoogleAuthHandler({
    authConfig: { googleClientId: null },
    database: { connect: async () => { throw new Error("database must not be accessed"); } },
    verifyCredential: async () => { throw new Error("verifier must not be called"); }
  });
  const result = await invoke(handler, { credential: "credential" });
  assert.equal(result.status, 503);
  assert.equal(result.payload.code, "GOOGLE_SIGN_IN_UNAVAILABLE");
});

test("Google auth route rejects an incorrect audience and unverified email", async (t) => {
  const rejectedIdentities = [
    ["wrong audience", validIdentity({ aud: "another-client-id" })],
    ["unverified email", validIdentity({ email_verified: false })],
    ["invalid issuer", validIdentity({ iss: "https://attacker.example" })],
    ["expired credential", validIdentity({ exp: Math.floor(Date.now() / 1000) - 1 })]
  ];
  for (const [label, identity] of rejectedIdentities) {
    await t.test(label, async () => {
      const handler = createGoogleAuthHandler({
        authConfig: { googleClientId: "google-client-id" },
        database: { connect: async () => { throw new Error("invalid identity must not reach database"); } },
        verifyCredential: async () => identity
      });
      const result = await invoke(handler, { credential: "credential" });
      assert.equal(result.status, 401);
      assert.deepEqual(result.payload, { error: "Authentication failed" });
    });
  }
});

test("Google auth verifier failures are returned as generic authentication failures", async () => {
  const handler = createGoogleAuthHandler({
    authConfig: { googleClientId: "google-client-id" },
    database: { connect: async () => { throw new Error("invalid signature must not reach database"); } },
    verifyCredential: async (_credential, audience) => {
      assert.equal(audience, "google-client-id");
      throw new Error("invalid signature");
    }
  });
  const result = await invoke(handler, { credential: "invalid" });
  assert.equal(result.status, 401);
  assert.deepEqual(result.payload, { error: "Authentication failed" });
});
