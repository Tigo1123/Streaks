const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { config } = require("../config/env");
const { requireAuth } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");

const router = express.Router();
const bcryptRounds = 12;
const timingSafeDummyHash = "$2b$12$awEq0H8rbTTlrTZZ/VJb8e0dWsd1pw8xF61emHtZvGer4rLNfzF7W";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    createdAt: new Date(row.created_at).toISOString()
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

router.post("/register", async (req, res) => {
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
       RETURNING id, email, created_at`,
      [email, passwordHash]
    );
    await client.query("INSERT INTO preferences (user_id) VALUES ($1)", [result.rows[0].id]);
    await client.query("COMMIT");
    return res.status(201).json({ user: safeUser(result.rows[0]) });
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

router.post("/login", async (req, res) => {
  const { email, password } = readCredentials(req.body);
  if (Array.from(password).length < 1 || Buffer.byteLength(password, "utf8") > 72) {
    throw new ApiError(401, "Invalid email or password");
  }

  const result = await pool.query(
    "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  const matches = await bcrypt.compare(password, user ? user.password_hash : timingSafeDummyHash);
  if (!user || !matches) throw new ApiError(401, "Invalid email or password");

  const token = jwt.sign({}, config.jwtSecret, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: "1h"
  });
  return res.json({ token, user: safeUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, email, created_at FROM users WHERE id = $1",
    [req.user.id]
  );
  if (result.rowCount === 0) throw new ApiError(401, "Authentication required");
  return res.json({ user: safeUser(result.rows[0]) });
});

module.exports = { router, normalizeEmail };
