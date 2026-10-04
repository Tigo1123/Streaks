const express = require("express");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../db/pool");
const { config } = require("../config/env");
const { requireAuth } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");
const { timeContext } = require("../utils/timezone");

const router = express.Router();
const googleOAuthClient = new OAuth2Client();
const bcryptRounds = 12;
const accessTokenLifetime = "30m";
const refreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const refreshTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const timingSafeDummyHash = "$2b$12$awEq0H8rbTTlrTZZ/VJb8e0dWsd1pw8xF61emHtZvGer4rLNfzF7W";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rateLimitMessage = { error: "Too many requests. Please try again later." };
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage
});
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage
});

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !emailPattern.test(email)) return null;
  return email;
}

function safeUser(row) {
  return {
    id: row.id,
    email: row.email,
    timezone: row.timezone ?? null,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function signAccessToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: accessTokenLifetime
  });
}

function newRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function insertRefreshToken(client, userId, familyId, token) {
  await client.query(
    `INSERT INTO auth_refresh_sessions (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, familyId, hashRefreshToken(token), new Date(Date.now() + refreshTokenLifetimeMs)]
  );
}

function validRefreshRequest(body) {
  return body && typeof body === "object" && !Array.isArray(body) &&
    typeof body.refreshToken === "string" && refreshTokenPattern.test(body.refreshToken);
}

async function verifyGoogleIdToken(credential, audience) {
  const ticket = await googleOAuthClient.verifyIdToken({ idToken: credential, audience });
  return ticket.getPayload();
}

function validGoogleIdentity(identity, audience) {
  const issuerIsValid = identity?.iss === "accounts.google.com" || identity?.iss === "https://accounts.google.com";
  const audienceIsValid = identity?.aud === audience ||
    (Array.isArray(identity?.aud) && identity.aud.includes(audience));
  return Boolean(
    identity &&
    issuerIsValid &&
    audienceIsValid &&
    Number.isFinite(identity.exp) &&
    identity.exp * 1000 > Date.now() &&
    identity.email_verified === true &&
    typeof identity.sub === "string" &&
    identity.sub.length > 0 &&
    normalizeEmail(identity.email)
  );
}

function createGoogleAuthHandler({
  database = pool,
  authConfig = config,
  verifyCredential = verifyGoogleIdToken
} = {}) {
  return async (req, res) => {
    if (!authConfig.googleClientId) {
      return res.status(503).json({
        error: "Google sign-in is not configured",
        code: "GOOGLE_SIGN_IN_UNAVAILABLE"
      });
    }

    if (!req.body || typeof req.body.credential !== "string" || !req.body.credential) {
      throw new ApiError(400, "Invalid authentication request");
    }

    let identity;
    try {
      identity = await verifyCredential(req.body.credential, authConfig.googleClientId);
    } catch {
      throw new ApiError(401, "Authentication failed");
    }
    if (!validGoogleIdentity(identity, authConfig.googleClientId)) {
      throw new ApiError(401, "Authentication failed");
    }

    const email = normalizeEmail(identity.email);
    const client = await database.connect();
    let user;
    let refreshToken;
    const familyId = crypto.randomUUID();

    try {
      await client.query("BEGIN");
      const bySubject = await client.query(
        `SELECT id, email, password_hash, google_sub, display_name, timezone, created_at
         FROM users WHERE google_sub = $1 FOR UPDATE`,
        [identity.sub]
      );
      user = bySubject.rows[0];

      if (!user) {
        const byEmail = await client.query(
          `SELECT id, email, password_hash, google_sub, display_name, timezone, created_at
           FROM users WHERE email = $1 FOR UPDATE`,
          [email]
        );
        user = byEmail.rows[0];

        if (user) {
          if (user.google_sub || !user.password_hash) {
            throw new ApiError(401, "Authentication failed");
          }
          if (typeof req.body.password !== "string") {
            throw new ApiError(
              409,
              "Confirm your current password to link this account",
              "GOOGLE_PASSWORD_CONFIRMATION_REQUIRED"
            );
          }
          const passwordMatches = await bcrypt.compare(req.body.password, user.password_hash);
          if (!passwordMatches) throw new ApiError(401, "Authentication failed");

          const linked = await client.query(
            `UPDATE users
             SET google_sub = $2, display_name = COALESCE(display_name, $3)
             WHERE id = $1
             RETURNING id, email, password_hash, google_sub, display_name, timezone, created_at`,
            [user.id, identity.sub, typeof identity.name === "string" ? identity.name.slice(0, 200) : null]
          );
          user = linked.rows[0];
          await client.query(
            `UPDATE auth_refresh_sessions SET revoked_at = COALESCE(revoked_at, now())
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [user.id]
          );
        } else {
          const created = await client.query(
            `INSERT INTO users (email, password_hash, google_sub, display_name)
             VALUES ($1, NULL, $2, $3)
             RETURNING id, email, password_hash, google_sub, display_name, timezone, created_at`,
            [email, identity.sub, typeof identity.name === "string" ? identity.name.slice(0, 200) : null]
          );
          user = created.rows[0];
          await client.query("INSERT INTO preferences (user_id) VALUES ($1)", [user.id]);
        }
      }

      refreshToken = newRefreshToken();
      await insertRefreshToken(client, user.id, familyId, refreshToken);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ApiError) throw error;
      if (error.code === "23505") throw new ApiError(409, "Authentication could not be completed");
      throw error;
    } finally {
      client.release();
    }

    return res.json({
      token: signAccessToken(user.id),
      refreshToken,
      user: safeUser(user),
      time: timeContext(user.timezone)
    });
  };
}

function readCredentials(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "A JSON object with email and password is required");
  }

  const email = normalizeEmail(body.email);
  if (!email) throw new ApiError(400, "Enter a valid email address");
  if (typeof body.password !== "string") {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  return { email, password: body.password };
}

router.post("/register", registerRateLimit, async (req, res) => {
  const { email, password } = readCredentials(req.body);
  if (Array.from(password).length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw new ApiError(400, "Password must be at least 8 characters and no more than 72 UTF-8 bytes");
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, timezone, created_at`,
      [email, passwordHash]
    );
    await client.query("INSERT INTO preferences (user_id) VALUES ($1)", [result.rows[0].id]);
    await client.query("COMMIT");
    return res.status(201).json({
      user: safeUser(result.rows[0]),
      time: timeContext(result.rows[0].timezone)
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505" && error.constraint === "users_email_unique") {
      throw new ApiError(409, "An account with this email already exists");
    }
    throw error;
  } finally {
    client.release();
  }
});

router.post("/login", loginRateLimit, async (req, res) => {
  const { email, password } = readCredentials(req.body);
  if (Array.from(password).length < 1 || Buffer.byteLength(password, "utf8") > 72) {
    throw new ApiError(401, "Invalid email or password");
  }

  const result = await pool.query(
    "SELECT id, email, password_hash, timezone, created_at FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  const passwordHash = user?.password_hash || timingSafeDummyHash;
  const matches = await bcrypt.compare(password, passwordHash);
  if (!user || !matches) throw new ApiError(401, "Invalid email or password");

  const refreshToken = newRefreshToken();
  const familyId = crypto.randomUUID();
  await insertRefreshToken(pool, user.id, familyId, refreshToken);
  return res.json({
    token: signAccessToken(user.id),
    refreshToken,
    user: safeUser(user),
    time: timeContext(user.timezone)
  });
});

router.post("/google", loginRateLimit, createGoogleAuthHandler());
router.post("/refresh", async (req, res) => {
  if (!validRefreshRequest(req.body)) throw new ApiError(401, "Authentication required");

  const presentedToken = req.body.refreshToken;
  const client = await pool.connect();
  let user;
  let nextRefreshToken;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, user_id, family_id, expires_at, revoked_at
       FROM auth_refresh_sessions
       WHERE token_hash = $1
       FOR UPDATE`,
      [hashRefreshToken(presentedToken)]
    );
    const session = result.rows[0];

    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      if (session) {
        await client.query(
          "UPDATE auth_refresh_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1",
          [session.family_id]
        );
      }
      await client.query("COMMIT");
      throw new ApiError(401, "Authentication required");
    }

    const userResult = await client.query(
      "SELECT id, email, timezone, created_at FROM users WHERE id = $1",
      [session.user_id]
    );
    user = userResult.rows[0];
    if (!user) {
      await client.query(
        "UPDATE auth_refresh_sessions SET revoked_at = now() WHERE family_id = $1",
        [session.family_id]
      );
      await client.query("COMMIT");
      throw new ApiError(401, "Authentication required");
    }

    nextRefreshToken = newRefreshToken();
    await client.query(
      "UPDATE auth_refresh_sessions SET revoked_at = now() WHERE id = $1",
      [session.id]
    );
    await insertRefreshToken(client, user.id, session.family_id, nextRefreshToken);
    await client.query("COMMIT");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return res.json({
    token: signAccessToken(user.id),
    refreshToken: nextRefreshToken,
    user: safeUser(user),
    time: timeContext(user.timezone)
  });
});

router.post("/logout", async (req, res) => {
  if (validRefreshRequest(req.body)) {
    await pool.query(
      `UPDATE auth_refresh_sessions
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE family_id = (
         SELECT family_id FROM auth_refresh_sessions WHERE token_hash = $1
       )`,
      [hashRefreshToken(req.body.refreshToken)]
    );
  }
  return res.status(204).end();
});

router.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, email, timezone, created_at FROM users WHERE id = $1",
    [req.user.id]
  );
  if (result.rowCount === 0) throw new ApiError(401, "Authentication required");
  return res.json({
    user: safeUser(result.rows[0]),
    time: timeContext(result.rows[0].timezone)
  });
});

module.exports = { router, normalizeEmail, createGoogleAuthHandler, validGoogleIdentity };
