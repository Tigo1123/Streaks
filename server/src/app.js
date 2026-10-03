const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { config } = require("./config/env");
const healthRoutes = require("./routes/health");
const { router: authRoutes } = require("./routes/auth");
const challengeRoutes = require("./routes/challenges");
const preferenceRoutes = require("./routes/preferences");
const syncRoutes = require("./routes/sync");
const { notFound } = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || config.corsOrigins.includes(origin));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "If-Match", "If-None-Match"],
  maxAge: 86400
}));
app.use(express.json({ limit: "16kb", strict: true }));

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/sync", syncRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
