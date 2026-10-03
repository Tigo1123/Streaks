const { addDays } = require("./data");

const formatters = new Map();

function formatterFor(timezone) {
  if (!formatters.has(timezone)) {
    formatters.set(timezone, new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }));
  }
  return formatters.get(timezone);
}

function normalizeTimezone(timezone) {
  if (timezone === null) return "UTC";
  if (typeof timezone !== "string" || !timezone) {
    throw new RangeError("A valid IANA timezone is required");
  }
  formatterFor(timezone);
  return timezone;
}

function isValidTimezone(timezone) {
  if (typeof timezone !== "string" || !timezone) return false;
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
}

function dateParts(date, timezone) {
  const parts = formatterFor(timezone).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function todayInZone(timezone, now = new Date()) {
  return dateParts(now, normalizeTimezone(timezone));
}

function nextMidnightInZone(timezone, now = new Date()) {
  const zone = normalizeTimezone(timezone);
  const nextDate = addDays(dateParts(now, zone), 1);
  const target = Date.parse(`${nextDate}T00:00:00.000Z`);

  let low = target - 36 * 60 * 60 * 1000;
  let high = target + 36 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dateParts(new Date(middle), zone) >= nextDate) high = middle;
    else low = middle;
  }
  return new Date(high);
}

function timeContext(timezone, now = new Date()) {
  const zone = normalizeTimezone(timezone);
  const nextMidnight = nextMidnightInZone(zone, now);
  return {
    today: dateParts(now, zone),
    serverNow: now.toISOString(),
    nextMidnightAt: new Date(nextMidnight.getTime() + 1000).toISOString()
  };
}

module.exports = {
  isValidTimezone,
  nextMidnightInZone,
  timeContext,
  todayInZone
};
