const jwt = require("jsonwebtoken");
const { config } = require("../config/env");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized(res) {
  res.set("WWW-Authenticate", "Bearer");
  return res.status(401).json({ error: "Authentication required" });
}

function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return unauthorized(res);

  try {
    const payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !uuidPattern.test(payload.sub)) return unauthorized(res);
    req.user = Object.freeze({ id: payload.sub });
    return next();
  } catch {
    return unauthorized(res);
  }
}

module.exports = { requireAuth };
