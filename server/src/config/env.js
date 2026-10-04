const dotenv = require("dotenv");

dotenv.config({ quiet: true });

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be set`);
  }
  return value.trim();
}

function parseOrigins(value) {
  const origins = required("CORS_ORIGIN", value)
    .split(",")
    .map((origin) => origin.trim());

  if (origins.some((origin) => origin === "*")) {
    throw new Error("CORS_ORIGIN must list explicit origins; wildcard origins are not allowed");
  }

  return origins.map((origin) => {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("CORS_ORIGIN must contain valid HTTP(S) origins");
    }

    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin.replace(/\/$/, "")) {
      throw new Error("CORS_ORIGIN entries must be origins without paths");
    }

    return parsed.origin;
  });
}

function loadConfig(source = process.env) {
  const databaseUrl = required("DATABASE_URL", source.DATABASE_URL);
  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  const jwtSecret = required("JWT_SECRET", source.JWT_SECRET);
  if (Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }

  const port = Number(source.PORT || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const nodeEnv = source.NODE_ENV || "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  return Object.freeze({
    port,
    databaseUrl,
    jwtSecret,
    googleClientId: typeof source.GOOGLE_CLIENT_ID === "string" && source.GOOGLE_CLIENT_ID.trim()
      ? source.GOOGLE_CLIENT_ID.trim()
      : null,
    corsOrigins: parseOrigins(source.CORS_ORIGIN),
    nodeEnv
  });
}

const config = loadConfig();

module.exports = { config, loadConfig };
