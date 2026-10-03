import { validDate, dayIndex } from "../utils/date.js";
import { captureSyncMutations } from "./sync.js";

export const STORAGE_KEY = "streaks-data";
export const BACKUP_PREFIX = `${STORAGE_KEY}-backup-`;
export const VERSION = 1;

let applyingSyncState = false;
const migrations = {
  0: (data) => ({ ...data, version: 1 })
};

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

function isQuotaExceeded(error) {
  return error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014;
}

function backupKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(BACKUP_PREFIX)) keys.push(key);
  }
  return keys.sort((a, b) => {
      const left = a.slice(BACKUP_PREFIX.length).split("-").map(Number);
      const right = b.slice(BACKUP_PREFIX.length).split("-").map(Number);
      return (left[0] - right[0]) || ((left[1] || 0) - (right[1] || 0));
    });
}

/**
 * Saves a raw data backup, retries once after removing the oldest backup on quota errors,
 * and retains only the three most recent backup keys.
 *
 * @param {string} raw
 * @returns {{ ok: boolean, key: string | null, error: any }}
 */
export function saveRawBackup(raw) {
  let key;
  try {
    const existing = backupKeys().find((backupKey) => localStorage.getItem(backupKey) === raw);
    if (existing) return { ok: true, key: existing, error: null };

    const base = `${BACKUP_PREFIX}${Date.now()}`;
    key = base;
    let suffix = 1;
    while (localStorage.getItem(key) !== null) {
      key = `${base}-${suffix++}`;
    }

    try {
      localStorage.setItem(key, raw);
    } catch (error) {
      if (!isQuotaExceeded(error)) throw error;
      const oldest = backupKeys()[0];
      if (!oldest) throw error;
      localStorage.removeItem(oldest);
      localStorage.setItem(key, raw);
    }

    const keys = backupKeys();
    for (const oldKey of keys.slice(0, Math.max(0, keys.length - 3))) {
      localStorage.removeItem(oldKey);
    }

    return { ok: true, key, error: null };
  } catch (error) {
    return { ok: false, key: null, error };
  }
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
 * Invalid JSON and unsupported schemas are returned for explicit recovery; they are never
 * replaced automatically. Older supported schemas are backed up before being migrated.
 *
 * @returns {{ ok: boolean, state: object, raw: string | null, error: any, quarantinedCount: number }}
 */
export function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return { ok: false, state: createInitialState(), raw: null, error: { code: "storage-unavailable", cause: error }, quarantinedCount: 0 };
  }

  if (raw === null) {
    return { ok: true, state: createInitialState(), raw: null, error: null, quarantinedCount: 0 };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return { ok: false, state: createInitialState(), raw, error: { code: "invalid-json", cause: error }, quarantinedCount: 0 };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, state: createInitialState(), raw, error: { code: "invalid-schema" }, quarantinedCount: 0 };
  }

  const sourceVersion = data.version === undefined ? 0 : data.version;
  if (!Number.isInteger(sourceVersion) || sourceVersion < 0 || sourceVersion > VERSION) {
    return { ok: false, state: createInitialState(), raw, error: { code: "unsupported-version", version: data.version }, quarantinedCount: 0 };
  }

  let migrated = data;
  let backedUp = false;
  if (sourceVersion < VERSION) {
    const backup = saveRawBackup(raw);
    if (!backup.ok) {
      return { ok: false, state: createInitialState(), raw, error: { code: "backup-failed", cause: backup.error }, quarantinedCount: 0 };
    }
    backedUp = true;

    try {
      for (let version = sourceVersion; version < VERSION; version++) {
        const migrate = migrations[version];
        if (!migrate) {
          return { ok: false, state: createInitialState(), raw, error: { code: "unsupported-version", version: sourceVersion }, quarantinedCount: 0 };
        }
        migrated = migrate(migrated);
      }
    } catch (error) {
      return { ok: false, state: createInitialState(), raw, error: { code: "migration-failed", cause: error }, quarantinedCount: 0 };
    }

    if (!Array.isArray(migrated.challenges)) {
      return { ok: false, state: createInitialState(), raw, error: { code: "invalid-schema" }, quarantinedCount: 0 };
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    } catch (error) {
      return { ok: false, state: createInitialState(), raw, error: { code: "migration-write-failed", cause: error }, quarantinedCount: 0 };
    }
  }

  if (!Array.isArray(migrated.challenges)) {
    return { ok: false, state: createInitialState(), raw, error: { code: "invalid-schema" }, quarantinedCount: 0 };
  }

  const challenges = migrated.challenges.filter(validChallenge);
  const quarantinedCount = migrated.challenges.length - challenges.length;
  if (quarantinedCount > 0 && !backedUp) {
    const backup = saveRawBackup(raw);
    if (!backup.ok) {
      return { ok: false, state: createInitialState(), raw, error: { code: "backup-failed", cause: backup.error }, quarantinedCount: 0 };
    }
  }

  const state = {
    version: VERSION,
    language: migrated.language === "ar" ? "ar" : "en",
    challenges,
    reminders: normalizeReminders(migrated.reminders)
  };

  return { ok: true, state, raw, error: null, quarantinedCount };
}

/**
 * Persists application state to localStorage and captures mutations for sync.
 *
 * @param {object} state - New application state to store
 * @param {string | null} [previousRaw=null] - Optional previous raw JSON string for mutation diffing
 * @returns {{ ok: boolean, error: any }} Whether the data was stored and any storage error
 */
export function persist(state, previousRaw = null) {
  try {
    const previous = previousRaw !== null ? previousRaw : localStorage.getItem(STORAGE_KEY);
    const next = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, next);

    if (!isApplyingSyncState()) {
      captureSyncMutations(previous, next);
    }
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Replaces unreadable data only after the caller has obtained explicit user confirmation.
 * The raw value is backed up before the replacement is attempted.
 *
 * @param {string} raw
 * @returns {{ ok: boolean, error: any }}
 */
export function replaceWithInitialState(raw) {
  const backup = saveRawBackup(raw);
  if (!backup.ok) return { ok: false, error: backup.error };

  try {
    if (localStorage.getItem(STORAGE_KEY) !== raw) {
      return { ok: false, error: new Error("Stored data changed; retry recovery") };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createInitialState()));
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}
