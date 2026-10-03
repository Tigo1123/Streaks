const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { config } = require("../config/env");

const databaseUrl = new URL(config.databaseUrl);
databaseUrl.searchParams.delete("ssl");
databaseUrl.searchParams.delete("sslmode");

function loadDatabaseCa() {
  const configuredCa = process.env.DATABASE_CA_CERT;
  if (configuredCa?.trim()) return configuredCa;

  const caPath = path.resolve(__dirname, "../../certs/supabase-ca.crt");
  try {
    return fs.readFileSync(caPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

const ssl = { rejectUnauthorized: true };
const ca = loadDatabaseCa();
if (ca) ssl.ca = ca;

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on("error", (error) => {
  console.error("Unexpected error on an idle PostgreSQL client:", error.message);
});

module.exports = pool;
