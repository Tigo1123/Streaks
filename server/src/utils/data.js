const { ApiError } = require("./errors");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "A JSON object is required");
  }
  return body;
}

function rejectUnknown(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ApiError(400, `Unknown field: ${unknown[0]}`);
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateString(value) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mapChallenge(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    duration: row.duration,
    startDate: dateString(row.start_date),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function mapCompletion(row) {
  return {
    id: row.id,
    completionDate: dateString(row.completion_date),
    completedAt: new Date(row.completed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function mapNote(row) {
  return {
    id: row.id,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function mapPreferences(row) {
  return {
    language: row.language,
    timezone: row.timezone ?? null
  };
}

function validateUuidParam(value) {
  if (!UUID_PATTERN.test(value)) throw new ApiError(404, "Not found");
}

module.exports = {
  addDays,
  dateString,
  isValidDate,
  mapChallenge,
  mapCompletion,
  mapNote,
  mapPreferences,
  rejectUnknown,
  requireObject,
  validateUuidParam
};
