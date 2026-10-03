import { STORAGE_KEY, VERSION, validChallenge, validImportChallenge } from "./storage.js";
import { validDate, localToday, migrationDate } from "../utils/date.js";
import { authRequest } from "./api.js";
import { migrationUuid } from "./sync.js";

export const MIGRATION_KEY = "streaks-cloud-migration-v1";

/**
 * Reads and strictly validates local data from localStorage before cloud upload.
 *
 * @returns {{ raw: string | null, source: any, counts: { challenges: number, completions: number, notes: number } }}
 */
export function readMigrationSource(today = localToday()) {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    throw new Error("cloudInvalidLocal|cloudStorageError");
  }

  if (raw === null) {
    return {
      raw,
      source: { version: VERSION, language: "en", challenges: [], reminders: { enabled: false } },
      counts: { challenges: 0, completions: 0, notes: 0 }
    };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error("cloudInvalidLocal|cloudNoData");
  }

  const bad = (reason) => {
    throw new Error(`cloudInvalidLocal|${reason}`);
  };

  if (!data || typeof data !== "object" || Array.isArray(data) || data.version !== VERSION || !Array.isArray(data.challenges)) {
    bad("cloudNoData");
  }

  if (data.language !== "en" && data.language !== "ar") {
    bad("cloudNoData");
  }

  const reminders = data.reminders === undefined ? { enabled: false } : data.reminders;
  if (!reminders || typeof reminders !== "object" || Array.isArray(reminders) || (reminders.enabled !== undefined && typeof reminders.enabled !== "boolean")) {
    bad("cloudNoData");
  }

  const ids = new Set();
  let completions = 0;
  let notes = 0;

  for (const c of data.challenges) {
    if (!c || typeof c !== "object" || Array.isArray(c) || !validChallenge(c) ||
        !c.id.trim() || c.id.length > 200 || ["__proto__", "constructor", "prototype"].includes(c.id) || ids.has(c.id)) {
      bad("cloudNoData");
    }
    ids.add(c.id);

    if (c.name.trim().length > 160) bad("cloudTitleInvalid");
    if (!validImportChallenge(c)) bad("cloudCompletionInvalid");

    for (const offset of c.completedDays) {
      const date = migrationDate(c.startDate, offset);
      if (!validDate(date) || date > migrationDate(today, 2)) {
        bad("cloudCompletionInvalid");
      }
      completions++;
    }

    if (Object.hasOwn(c, "note")) {
      if (typeof c.note !== "string" || c.note.length > 1000) bad("cloudNoteInvalid");
      notes++;
    }
  }

  return {
    raw,
    source: {
      version: VERSION,
      language: data.language,
      challenges: data.challenges,
      reminders: { enabled: reminders.enabled === true }
    },
    counts: { challenges: data.challenges.length, completions, notes }
  };
}

/**
 * Reads streaks-cloud-migration-v1 store from localStorage.
 */
export function migrationStore() {
  let store;
  try {
    store = JSON.parse(localStorage.getItem(MIGRATION_KEY) || "null");
  } catch (_) {
    throw new Error("cloudStorageError");
  }
  if (store === null) return { version: 1, accounts: {} };
  if (!store || store.version !== 1 || !store.accounts || typeof store.accounts !== "object" || Array.isArray(store.accounts)) {
    throw new Error("cloudStorageError");
  }

  for (const entry of Object.values(store.accounts)) {
    if (!entry || typeof entry !== "object" || !entry.challenges || typeof entry.challenges !== "object" || Array.isArray(entry.challenges)) {
      throw new Error("cloudStorageError");
    }
    const keys = new Set();
    const cloudIds = new Set();
    for (const mapping of Object.values(entry.challenges)) {
      if (!mapping || typeof mapping !== "object" || typeof mapping.migrationKey !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mapping.migrationKey) ||
          keys.has(mapping.migrationKey.toLowerCase()) ||
          (mapping.cloudId !== null && typeof mapping.cloudId !== "string") ||
          (mapping.cloudId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mapping.cloudId)) ||
          (mapping.cloudId && cloudIds.has(mapping.cloudId.toLowerCase()))) {
        throw new Error("cloudStorageError");
      }
      keys.add(mapping.migrationKey.toLowerCase());
      if (mapping.cloudId) cloudIds.add(mapping.cloudId.toLowerCase());
    }
  }

  return store;
}

export function saveMigrationStore(store) {
  try {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(store));
    return true;
  } catch (_) {
    return false;
  }
}

export function accountMigration(userId, store = migrationStore()) {
  return store.accounts[userId] || null;
}

export function migrationFailureKey(error) {
  if (error?.message?.startsWith("cloud")) return error.message.split("|")[0];
  const status = error?.status;
  if (status === 401) return "cloudSessionExpired";
  if (status === 403) return "cloudPermissionError";
  if (status === 404) return "cloudNotFound";
  if (status === 409) return "cloudValidationError";
  if (status === 429) return "cloudRateLimited";
  if (status === 400) return "cloudValidationError";
  if (status >= 500) return "cloudServerError";
  return "cloudNetworkError";
}

/**
 * Performs one-way backup of local challenges, completions, notes, and preferences to the cloud.
 */
export async function migrateLocalData({ token, userId, onProgress, today = localToday() }) {
  if (!token || !userId) throw new Error("Missing authentication credentials");

  const validated = readMigrationSource(today);
  const source = validated.source;
  const counts = validated.counts;

  if (!counts.challenges) {
    return { resultKey: "cloudNothing", counts: null };
  }

  const store = migrationStore();
  const record = store.accounts[userId] || {
    startedAt: new Date().toISOString(),
    challenges: {},
    preferencesBackedUp: false
  };
  record.completedAt = null;
  store.accounts[userId] = record;
  if (!saveMigrationStore(store)) throw new Error("cloudStorageError");

  const progress = {
    challengesDone: 0,
    challengesTotal: counts.challenges,
    completionsDone: 0,
    completionsTotal: counts.completions,
    notesDone: 0,
    notesTotal: counts.notes
  };

  const notifyProgress = () => {
    onProgress?.({ ...progress });
  };
  notifyProgress();

  const saveRecord = () => {
    record.lastAttemptAt = new Date().toISOString();
    if (!saveMigrationStore(store)) throw new Error("cloudStorageError");
  };

  try {
    for (const local of source.challenges) {
      let mapping = Object.hasOwn(record.challenges, local.id) ? record.challenges[local.id] : null;
      if (!mapping) {
        mapping = { migrationKey: migrationUuid(), cloudId: null };
        record.challenges[local.id] = mapping;
        saveRecord();
      }

      const payload = {
        title: local.name.trim(),
        description: null,
        duration: local.durationDays,
        startDate: local.startDate,
        migrationKey: mapping.migrationKey
      };

      const created = await authRequest("/api/challenges", {
        method: "POST",
        token,
        body: payload
      });

      if (!created.response.ok || typeof created.payload?.challenge?.id !== "string") {
        throw Object.assign(new Error("api"), { status: created.response.status || 500 });
      }

      mapping.cloudId = created.payload.challenge.id;
      saveRecord();

      const remote = created.payload.challenge;
      const patch = {};
      if (remote.title !== payload.title) patch.title = payload.title;
      if (remote.description !== null) patch.description = null;
      if (remote.duration !== payload.duration) patch.duration = payload.duration;
      if (remote.startDate !== payload.startDate) patch.startDate = payload.startDate;

      if (Object.keys(patch).length) {
        const updated = await authRequest(`/api/challenges/${encodeURIComponent(mapping.cloudId)}`, {
          method: "PATCH",
          token,
          body: patch
        });
        if (!updated.response.ok) throw Object.assign(new Error("api"), { status: updated.response.status });
      }

      progress.challengesDone++;
      notifyProgress();

      for (const offset of local.completedDays) {
        const completionDate = migrationDate(local.startDate, offset);
        const result = await authRequest(`/api/challenges/${encodeURIComponent(mapping.cloudId)}/completions`, {
          method: "POST",
          token,
          body: { completionDate }
        });
        if (!result.response.ok && result.response.status !== 409) {
          throw Object.assign(new Error("api"), { status: result.response.status });
        }
        progress.completionsDone++;
        notifyProgress();
      }

      if (Object.hasOwn(local, "note")) {
        const result = await authRequest(`/api/challenges/${encodeURIComponent(mapping.cloudId)}/notes`, {
          method: "PUT",
          token,
          body: { content: local.note }
        });
        if (!result.response.ok) throw Object.assign(new Error("api"), { status: result.response.status });
        progress.notesDone++;
        notifyProgress();
      }

      mapping.completedDates = local.completedDays.map((offset) => migrationDate(local.startDate, offset));
      mapping.noteBackedUp = Object.hasOwn(local, "note");
      mapping.backedUpAt = new Date().toISOString();
      saveRecord();
    }

    const prefs = await authRequest("/api/preferences", {
      method: "PATCH",
      token,
      body: { language: source.language, remindersEnabled: source.reminders.enabled }
    });
    if (!prefs.response.ok) {
      throw Object.assign(new Error("api"), { status: prefs.response.status, preferenceFailure: true });
    }

    record.preferencesBackedUp = true;
    record.completedAt = new Date().toISOString();
    saveRecord();

    return {
      resultKey: "cloudComplete",
      counts: {
        challenges: progress.challengesDone,
        completions: progress.completionsDone,
        notes: progress.notesDone
      }
    };
  } catch (error) {
    let resultKey = migrationFailureKey(error);
    if (error.preferenceFailure && error.status !== 401) {
      resultKey = "cloudPreferencesFailed";
    }
    try {
      record.lastErrorAt = new Date().toISOString();
      saveRecord();
    } catch (_) {}

    return {
      resultKey,
      counts: {
        challenges: progress.challengesDone,
        completions: progress.completionsDone,
        notes: progress.notesDone
      },
      error
    };
  }
}
