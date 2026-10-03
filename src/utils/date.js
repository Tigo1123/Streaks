export const DAY_MS = 86400000;

const formatters = new Map();

export function isValidTimezone(timezone) {
  if (typeof timezone !== "string" || !timezone) return false;
  try {
    if (!formatters.has(timezone)) {
      formatters.set(timezone, new Intl.DateTimeFormat("en-CA", {
        calendar: "gregory",
        numberingSystem: "latn",
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }));
    }
    return true;
  } catch {
    return false;
  }
}

export function detectedTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(timezone) ? timezone : "UTC";
  } catch {
    return "UTC";
  }
}

function dateParts(now, timezone) {
  const zone = timezone || detectedTimezone();
  if (!isValidTimezone(zone)) throw new RangeError("A valid IANA timezone is required");
  const formatter = formatters.get(zone);
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Returns the current calendar date in an IANA timezone as "YYYY-MM-DD".
 *
 * @param {Date} [now=new Date()]
 * @param {string} [timezone]
 * @returns {string}
 */
export function localToday(now = new Date(), timezone = detectedTimezone()) {
  return dateParts(now, timezone);
}

export function nextMidnightInZone(timezone, now = new Date()) {
  if (!isValidTimezone(timezone)) throw new RangeError("A valid IANA timezone is required");
  const targetDate = migrationDate(localToday(now, timezone), 2);
  const target = Date.parse(`${targetDate}T00:00:00.000Z`);
  let low = target - 36 * 60 * 60 * 1000;
  let high = target + 36 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localToday(new Date(middle), timezone) >= targetDate) high = middle;
    else low = middle;
  }
  return new Date(high);
}

export function scheduleTodayRollover({ timezone, serverTime, onRollover, now = new Date() }) {
  const delay = serverTime
    ? Math.max(0, serverTime.delayMs ?? Date.parse(serverTime.nextMidnightAt) - Date.parse(serverTime.serverNow))
    : Math.max(0, nextMidnightInZone(timezone, now).getTime() - now.getTime() + 1000);
  const timer = setTimeout(() => onRollover(), delay);
  return () => clearTimeout(timer);
}

/**
 * Validates whether a string is a valid YYYY-MM-DD date.
 * Verifies format and calendar existence (handles leap years, days in month).
 *
 * @param {any} s
 * @returns {boolean}
 */
export function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
}

/**
 * Converts a YYYY-MM-DD date string into UTC milliseconds for midnight of that day.
 *
 * @param {string} s
 * @returns {number}
 */
export function dateValue(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Calculates the 1-based day index of today relative to a challenge's startDate.
 * Can be <= 0 if the challenge starts in the future.
 *
 * @param {{ startDate: string }} challenge
 * @param {string} [todayStr=localToday()]
 * @returns {number}
 */
export function dayIndex(challenge, todayStr = localToday()) {
  return Math.floor((dateValue(todayStr) - dateValue(challenge.startDate)) / DAY_MS) + 1;
}

/**
 * Calculates the elapsed days of a challenge, clamped between 0 and durationDays.
 *
 * @param {{ startDate: string, durationDays: number }} challenge
 * @param {string} [todayStr=localToday()]
 * @returns {number}
 */
export function elapsed(challenge, todayStr = localToday()) {
  return Math.min(challenge.durationDays, Math.max(0, dayIndex(challenge, todayStr)));
}

/**
 * Computes the calendar date for a given 1-based day offset from startDate.
 * Preserves exact mathematical offset calculation using UTC date math.
 *
 * @param {string} startDate - "YYYY-MM-DD"
 * @param {number} offset - 1-based day number
 * @returns {string} - "YYYY-MM-DD"
 */
export function migrationDate(startDate, offset) {
  const d = new Date(`${startDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Computes the 1-based day offset for a given calendar date from startDate.
 *
 * @param {string} startDate - "YYYY-MM-DD"
 * @param {string} date - "YYYY-MM-DD"
 * @returns {number}
 */
export function offsetForDate(startDate, date) {
  return Math.round((dateValue(date) - dateValue(startDate)) / DAY_MS) + 1;
}
