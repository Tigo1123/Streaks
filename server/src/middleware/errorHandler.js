const { config } = require("../config/env");
const { ApiError } = require("../utils/errors");

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (config.nodeEnv !== "production") {
    console.error("Unhandled API error:", error);
  } else {
    console.error("Unhandled API error:", error.message);
  }

  return res.status(500).json({ error: "Internal server error" });
}

module.exports = { errorHandler };
