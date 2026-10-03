const { Pool } = require("pg");
const { config } = require("../config/env");

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on("error", (error) => {
  console.error("Unexpected error on an idle PostgreSQL client:", error.message);
});

module.exports = pool;
