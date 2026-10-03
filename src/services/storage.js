import { validDate, dayIndex } from "../utils/date.js";
import { captureSyncMutations } from "./sync.js";

export const STORAGE_KEY = "streaks-data";
export const VERSION = 1;

let applyingSyncState = false;

export function isApplyingSyncState() {
  return applyingSyncState;
}

export function setApplyingSyncState(value) {
  applyingSyncState = Boolean(value);
}

/**
 * Validates ISO 8601 UTC timestamp format: YYYY-MM-DDTHH:mm:ss.sssZ
 *
 * @param {any} s
 * @returns {boolean}
 */
export function validTimestamp(s) {
  if (typeof s !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)) return false;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) && d.toISOString() === s;
}

/**
 * Validates a single challenge object according to the Streaks schema.
 *
 * @param {any} c
 * @returns {boolean}
 */
export function validChallenge(c) {
  return (
    c !== null &&
    typeof c === "object" &&
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    Number.isInteger(c.durationDays) &&
    c.durationDays >= 1 &&
    c.durationDays <= 365 &&
    validDate(c.startDate) &&
    Array.isArray(c.completedDays) &&
    new Set(c.completedDays).size === c.completedDays.length &&
    c.completedDays.every((n) => Number.isInteger(n) && n >= 1 && n <= c.durationDays) &&
    typeof c.createdAt === "string" &&
    validTimestamp(c.createdAt) &&
    (c.note === undefined || typeof c.note === "string")
  );
}

/**
 * Validates challenge data during import, ensuring completed days do not exceed elapsed days.
 *
 * @param {any} c
 * @returns {boolean}
 */
export function validImportChallenge(c) {
  return validChallenge(c) && c.completedDays.every((n) => n <= Math.min(c.durationDays, Math.max(0, dayIndex(c))));
}

/**
 * Normalizes reminders object to prevent malformed properties.
 *
 * @param {any} value
 * @returns {{ enabled: boolean, lastReminderDate: string }}
 */
export function normalizeReminders(value) {
  return {
    enabled: value?.enabled === true,
    lastReminderDate:
      typeof value?.lastReminderDate === "string" && /^\d{4}-\d\d-\d\d$/.test(value.lastReminderDate)
        ? value.lastReminderDate
        : ""
  };
}

/**
 * Returns default initial state.
 *
 * @returns {{ version: number, language: "en" | "ar", challenges: any[], reminders: { enabled: boolean, lastReminderDate: string } }}
 */
export function createInitialState() {
  return {
    version: VERSION,
    language: "en",
    challenges: [],
    reminders: { enabled: false, lastReminderDate: "" }
  };
}

/**
 * Deep-clones state.
 *
 * @param {any} state
 * @returns {any}
 */
export function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Reads and validates existing streaks-data from localStorage.
 * CRITICAL SAFETY: Never writes to localStorage during load().
 * If storage is empty or invalid, returns a clean default state without side-effects.
 *
 * @returns {{ version: number, language: "en" | "ar", challenges: any[], reminders: { enabled: boolean, lastReminderDate: string } }}
 */
export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const data = JSON.parse(raw);
    if (data && data.version === VERSION) {
      return {
        version: VERSION,
        language: data.language === "ar" ? "ar" : "en",
        challenges: Array.isArray(data.challenges) ? data.challenges.filter(validChallenge) : [],
        reminders: normalizeReminders(data.reminders)
      };
    }
  } catch (_) {
    // If parsing fails or storage is inaccessible, fall back to initial state safely
  }
  return createInitialState();
}

/**
 * Persists application state to localStorage and captures mutations for sync.
 *
 * @param {object} state - New application state to store
 * @param {string | null} [previousRaw=null] - Optional previous raw JSON string for mutation diffing
 * @returns {boolean} True if successfully stored, false otherwise
 */
export function persist(state, previousRaw = null) {
  try {
    const previous = previousRaw !== null ? previousRaw : localStorage.getItem(STORAGE_KEY);
    const next = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, next);

    if (!isApplyingSyncState()) {
      captureSyncMutations(previous, next);
    }
    return true;
  } catch (_) {
    return false;
  }
}
