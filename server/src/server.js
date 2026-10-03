const app = require("./app");
const pool = require("./db/pool");
const { config } = require("./config/env");

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Streaks API listening on port ${config.port}`);
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing API server`);
  server.close(() => {
    pool.end()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("Could not close the database pool:", error.message);
        process.exit(1);
      });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { server, shutdown };
