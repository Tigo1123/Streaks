export const DAY_MS = 86400000;

/**
 * Returns today's calendar date in local time as "YYYY-MM-DD".
 * Streaks uses local calendar dates so daily habit check-ins align with the user's local day.
 *
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function localToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
