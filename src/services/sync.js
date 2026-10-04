import { detectedTimezone, isValidTimezone, migrationDate, offsetForDate, validDate, dateValue, DAY_MS } from "../utils/date.js";
import { authRequest } from "./api.js";
import { commitIfUnchanged, STORAGE_KEY } from "./storage.js";

export const SYNC_META_KEY = "streaks-cloud-sync-v1";
export const SYNC_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sameSyncValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloudFields(challenge) {
  return {
    title: challenge.title,
    duration: challenge.duration,
    startDate: challenge.startDate
  };
}

export function localSyncFields(challenge) {
  return {
    title: challenge.name,
    duration: challenge.durationDays,
    startDate: challenge.startDate
  };
}

export function completionDates(challenge) {
  return challenge.completedDays.map((day) => migrationDate(challenge.startDate, day));
}

export function migrationUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes a SHA-256 hash (or bitwise fallback) of a note string.
 *
 * @param {string | null} note
 * @returns {Promise<string | null>}
 */
export async function syncNoteHash(note) {
  if (note === null || note === undefined) return null;
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(note);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let h = 0;
  for (let i = 0; i < note.length; i++) {
    h = ((h << 5) - h + note.charCodeAt(i)) | 0;
  }
  return String(h);
}

/**
 * Validates the cloud snapshot structure received from GET /api/sync.
 *
 * @param {any} snapshot
 */
export function validateCloudSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.challenges) || !Array.isArray(snapshot.completions) ||
      !Array.isArray(snapshot.notes) || !Array.isArray(snapshot.tombstones) || !snapshot.preferences ||
      !snapshot.time || !validDate(snapshot.time.today) ||
      !Number.isFinite(Date.parse(snapshot.time.serverNow)) ||
      !Number.isFinite(Date.parse(snapshot.time.nextMidnightAt))) {
    throw new Error("syncInvalid");
  }

  const ids = new Set();
  for (const c of snapshot.challenges) {
    if (!c || !SYNC_UUID_PATTERN.test(c.id) || ids.has(c.id) ||
        typeof c.title !== "string" || !c.title.trim() || c.title.length > 160 ||
        (c.description !== null && typeof c.description !== "string") ||
        !Number.isInteger(c.duration) || c.duration < 1 || c.duration > 365 ||
        !validDate(c.startDate) ||
        !Number.isFinite(Date.parse(c.createdAt)) || !Number.isFinite(Date.parse(c.updatedAt))) {
      throw new Error("syncInvalid");
    }
    ids.add(c.id);
  }

  const completions = new Set();
  for (const item of snapshot.completions) {
    if (!item || !ids.has(item.challengeId) || !validDate(item.completionDate)) {
      throw new Error("syncInvalid");
    }
    const challenge = snapshot.challenges.find((c) => c.id === item.challengeId);
    const offset = offsetForDate(challenge.startDate, item.completionDate);
    const latestAllowedDate = migrationDate(snapshot.time.today, 2);
    if (offset < 1 || offset > challenge.duration || item.completionDate > latestAllowedDate) {
      throw new Error("syncInvalid");
    }
    const key = `${item.challengeId}|${item.completionDate}`;
    if (completions.has(key)) throw new Error("syncInvalid");
    completions.add(key);
  }

  const notes = new Set();
  for (const item of snapshot.notes) {
    if (!item || !ids.has(item.challengeId) || notes.has(item.challengeId) ||
        !item.note || typeof item.note.content !== "string" || item.note.content.length > 1000 ||
        !Number.isFinite(Date.parse(item.note.updatedAt))) {
      throw new Error("syncInvalid");
    }
    notes.add(item.challengeId);
  }

  for (const tombstone of snapshot.tombstones) {
    if (!tombstone || !["challenge", "completion"].includes(tombstone.entityType) ||
        typeof tombstone.entityKey !== "string" || !Number.isFinite(Date.parse(tombstone.deletedAt))) {
      throw new Error("syncInvalid");
    }
    if (tombstone.entityType === "challenge" && !SYNC_UUID_PATTERN.test(tombstone.entityKey)) {
      throw new Error("syncInvalid");
    }
    if (tombstone.entityType === "completion" && !/^[0-9a-f-]{36}\|\d{4}-\d{2}-\d{2}$/i.test(tombstone.entityKey)) {
      throw new Error("syncInvalid");
    }
  }

  if (!["en", "ar"].includes(snapshot.preferences.language) ||
      typeof snapshot.preferences.remindersEnabled !== "boolean" ||
      (snapshot.preferences.timezone !== null && !isValidTimezone(snapshot.preferences.timezone)) ||
      (snapshot.preferences.updatedAt !== null && !Number.isFinite(Date.parse(snapshot.preferences.updatedAt)))) {
    throw new Error("syncInvalid");
  }
}

/**
 * Reads streaks-cloud-sync-v1 metadata from localStorage.
 */
export function readSyncMetadata() {
  let store;
  try {
    store = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "null");
  } catch (_) {
    throw new Error("syncStorage");
  }
  if (store === null) return { version: 1, accounts: {} };
  if (!store || store.version !== 1 || !store.accounts || typeof store.accounts !== "object" || Array.isArray(store.accounts)) {
    throw new Error("syncStorage");
  }
  return store;
}

/**
 * Persists streaks-cloud-sync-v1 metadata to localStorage.
 */
export function saveSyncMetadata(store) {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(store));
    return true;
  } catch (_) {
    return false;
  }
}

export function newSyncAccount() {
  return {
    lastSyncedAt: null,
    challenges: {},
    preferencesBaseline: null,
    pending: {
      challengeChanges: {},
      noteChanges: {},
      challengeDeletes: {},
      completionAdds: {},
      completionDeletes: {},
      preferencesChangedAt: null
    }
  };
}

export function ensureSyncAccount(store, userId) {
  let account = store.accounts[userId];
  if (!account) account = store.accounts[userId] = newSyncAccount();
  account.pending ||= newSyncAccount().pending;
  account.challenges ||= {};
  account.pending.challengeChanges ||= {};
  account.pending.noteChanges ||= {};
  account.pending.challengeDeletes ||= {};
  account.pending.completionAdds ||= {};
  account.pending.completionDeletes ||= {};
  return account;
}

/**
 * Captures mutations between previous and current streaks-data state for synchronization.
 * Skipped when applyingSyncState is true.
 */
export function captureSyncMutations(previousRaw, nextRaw) {
  try {
    const before = previousRaw ? JSON.parse(previousRaw) : null;
    const after = JSON.parse(nextRaw);
    const store = readSyncMetadata();
    const accounts = Object.values(store.accounts);
    if (!accounts.length) return;

    const now = new Date().toISOString();
    for (const account of accounts) {
      const ids = new Set([
        ...Object.keys(account.challenges || {}),
        ...(before?.challenges || []).map((c) => c.id),
        ...(after.challenges || []).map((c) => c.id)
      ]);

      for (const id of ids) {
        const mapping = account.challenges?.[id];
        if (!mapping) continue;

        const old = before?.challenges?.find((c) => c.id === id);
        const current = after.challenges.find((c) => c.id === id);

        if (old && !current) {
          account.pending.challengeDeletes[id] = now;
          continue;
        }

        if (!current) continue;

        if (account.pending.challengeDeletes[id]) {
          delete account.pending.challengeDeletes[id];
        }

        if (!old || JSON.stringify(localSyncFields(old)) !== JSON.stringify(localSyncFields(current))) {
          account.pending.challengeChanges[id] = now;
        }

        if (!old || old.note !== current.note) {
          account.pending.noteChanges[id] = now;
        }

        const oldDates = new Set((old?.completedDays || []).map((n) => migrationDate(old.startDate, n)));
        const newDates = new Set(current.completedDays.map((n) => migrationDate(current.startDate, n)));

        const adds = account.pending.completionAdds[id] || {};
        const deletes = account.pending.completionDeletes[id] || {};

        for (const date of newDates) {
          if (!oldDates.has(date)) {
            adds[date] = now;
            delete deletes[date];
          }
        }

        for (const date of oldDates) {
          if (!newDates.has(date)) {
            deletes[date] = now;
            delete adds[date];
          }
        }

        account.pending.completionAdds[id] = adds;
        account.pending.completionDeletes[id] = deletes;
      }

      if (before && (before.language !== after.language || before.reminders?.enabled !== after.reminders?.enabled)) {
        account.pending.preferencesChangedAt = now;
      }
    }

    saveSyncMetadata(store);
  } catch (_) {
    // The primary local write must remain usable if sync metadata cannot be updated
  }
}

export function makeLocalFromCloud(remote, dates, note, id) {
  const offsets = dates
    .map((date) => offsetForDate(remote.startDate, date))
    .filter((day) => day >= 1 && day <= remote.duration)
    .sort((a, b) => a - b);

  const local = {
    id,
    name: remote.title,
    durationDays: remote.duration,
    startDate: remote.startDate,
    completedDays: [...new Set(offsets)],
    createdAt: remote.createdAt
  };

  if (note !== null) local.note = note;
  return local;
}

function setChallenge(list, id, value) {
  const index = list.findIndex((c) => c.id === id);
  if (value === null) {
    if (index >= 0) list.splice(index, 1);
    return;
  }
  if (index >= 0) list[index] = value;
  else list.push(value);
}

export function challengeChangedSinceBaseline(local, entry, pending) {
  if (!entry?.baseline) return false;
  const localChanged = !sameSyncValue(localSyncFields(local), entry.baseline.fields);
  const changedAt = pending.challengeChanges?.[local.id];
  return localChanged || Boolean(changedAt && (!entry.lastSyncedAt || changedAt > entry.lastSyncedAt));
}

export function noteChangedSinceBaseline(local, entry, pending) {
  if (!entry?.baseline) return false;
  const changedAt = pending.noteChanges?.[local.id];
  return Boolean(changedAt && (!entry.lastSyncedAt || changedAt > entry.lastSyncedAt));
}

function addSyncConflict(conflicts, key, kind, title, localValue, cloudValue, decisions) {
  if (Object.hasOwn(decisions, key)) return decisions[key];
  conflicts.push({ key, kind, title, localValue, cloudValue });
  return "cloud";
}

/**
 * 3-Way Merge Synchronization Analyzer.
 * Compares Local Current State, Cloud Snapshot, and Last Sync Baseline.
 */
export async function analyseSync(localData, rawLocal, snapshot, account, legacy, decisions = {}) {
  const remoteById = new Map(snapshot.challenges.map((c) => [c.id, c]));
  const completionMap = new Map();
  const noteMap = new Map(snapshot.notes.map((n) => [n.challengeId, n.note]));

  for (const c of snapshot.challenges) completionMap.set(c.id, new Set());
  for (const item of snapshot.completions) completionMap.get(item.challengeId).add(item.completionDate);

  const challengeTombstones = new Map(
    snapshot.tombstones.filter((t) => t.entityType === "challenge").map((t) => [t.entityKey, t])
  );
  const completionTombstones = new Map(
    snapshot.tombstones.filter((t) => t.entityType === "completion").map((t) => [t.entityKey, t])
  );

  const conflicts = [];
  const deletions = [];
  const items = [];
  const nextChallenges = JSON.parse(JSON.stringify(localData.challenges));
  const knownLocal = new Set();
  const handledCloud = new Set();
  let localDeletionsApplied = 0;

  const pending = account.pending;
  const legacyChallenges = legacy?.challenges || {};
  const localOnlyIds = new Set(account.localOnlyIds || []);

  for (const local of localData.challenges) {
    knownLocal.add(local.id);
    if (localOnlyIds.has(local.id)) {
      const changed =
        pending.challengeChanges[local.id] ||
        pending.noteChanges[local.id] ||
        pending.challengeDeletes[local.id] ||
        Object.keys(pending.completionAdds[local.id] || {}).length ||
        Object.keys(pending.completionDeletes[local.id] || {}).length;
      if (!changed) continue;
      localOnlyIds.delete(local.id);
    }
    let entry = account.challenges[local.id];

    if (!entry && legacyChallenges[local.id]) {
      const old = legacyChallenges[local.id];
      entry = {
        cloudId: old.cloudId,
        migrationKey: old.migrationKey,
        baseline: null,
        lastSyncedAt: null
      };
      account.challenges[local.id] = entry;
    }

    if (!entry) {
      entry = {
        cloudId: null,
        migrationKey: migrationUuid(),
        baseline: null,
        lastSyncedAt: null
      };
      account.challenges[local.id] = entry;
    }

    const remote = entry.cloudId ? remoteById.get(entry.cloudId) : null;
    const cloudDeleted = entry.cloudId ? challengeTombstones.get(entry.cloudId) : null;

    if (remote) handledCloud.add(remote.id);

    if (cloudDeleted) {
      const localDates = completionDates(local).sort();
      const baseDates = [...(entry.baseline?.completionDates || [])].sort();
      const localHash = await syncNoteHash(Object.hasOwn(local, "note") ? local.note : null);
      const pendingCompletion =
        Object.keys(pending.completionAdds?.[local.id] || {}).length ||
        Object.keys(pending.completionDeletes?.[local.id] || {}).length;
      const localDirty = entry.baseline
        ? challengeChangedSinceBaseline(local, entry, pending) ||
          noteChangedSinceBaseline(local, entry, pending) ||
          localHash !== entry.baseline.noteHash ||
          !sameSyncValue(localDates, baseDates) ||
          pendingCompletion
        : true;

      if (localDirty) {
        const decision = addSyncConflict(
          conflicts,
          `challenge-restore:${local.id}`,
          "delete-cloud",
          local.name,
          localSyncFields(local),
          "syncCloudDeleted",
          decisions
        );

        if (decision === "local") {
          entry.cloudId = null;
          entry.migrationKey = migrationUuid();
          items.push({
            localId: local.id,
            entry,
            localNext: local,
            originalDates: completionDates(local),
            forceCreate: true,
            remote: null,
            remoteNote: null
          });
        } else {
          setChallenge(nextChallenges, local.id, null);
          localDeletionsApplied++;
        }
      } else {
        setChallenge(nextChallenges, local.id, null);
        localDeletionsApplied++;
      }
      continue;
    }

    if (!remote) {
      items.push({
        localId: local.id,
        entry,
        localNext: local,
        originalDates: completionDates(local),
        forceCreate: true,
        remote: null,
        remoteNote: null
      });
      continue;
    }

    const localFields = localSyncFields(local);
    const remoteFields = cloudFields(remote);
    const base = entry.baseline;

    const localChanged = base ? challengeChangedSinceBaseline(local, entry, pending) : !sameSyncValue(localFields, remoteFields);
    const cloudChanged = base
      ? (!sameSyncValue(remoteFields, base.fields) || remote.updatedAt > base.challengeUpdatedAt)
      : !sameSyncValue(localFields, remoteFields);

    let selectedFields = localFields;
    if (localChanged && cloudChanged && !sameSyncValue(localFields, remoteFields)) {
      const decision = addSyncConflict(
        conflicts,
        `challenge:${local.id}`,
        "challenge",
        local.name,
        localFields,
        remoteFields,
        decisions
      );
      selectedFields = decision === "local" ? localFields : remoteFields;
    } else if (cloudChanged && !localChanged) {
      selectedFields = remoteFields;
    }

    const localNote = Object.hasOwn(local, "note") ? local.note : null;
    const cloudNote = noteMap.get(remote.id)?.content ?? null;
    const localHash = await syncNoteHash(localNote);
    const cloudHash = await syncNoteHash(cloudNote);
    const baseNote = base?.noteHash;

    const localNoteChanged = base ? localHash !== baseNote || noteChangedSinceBaseline(local, entry, pending) : localHash !== cloudHash;
    const cloudNoteChanged = base
      ? cloudHash !== baseNote || Boolean(noteMap.get(remote.id) && noteMap.get(remote.id).updatedAt > base.noteUpdatedAt)
      : localHash !== cloudHash;

    let selectedNote = localNote;
    if (localNoteChanged && cloudNoteChanged && localHash !== cloudHash) {
      const decision = addSyncConflict(
        conflicts,
        `note:${local.id}`,
        "note",
        local.name,
        localNote,
        cloudNote,
        decisions
      );
      selectedNote = decision === "local" ? localNote : cloudNote;
    } else if (cloudNoteChanged && !localNoteChanged) {
      selectedNote = cloudNote;
    }

    const localNext = {
      ...local,
      name: selectedFields.title,
      durationDays: selectedFields.duration,
      startDate: selectedFields.startDate
    };

    if (selectedNote === null) delete localNext.note;
    else localNext.note = selectedNote;

    items.push({
      localId: local.id,
      entry,
      localNext,
      originalDates: completionDates(local),
      remote,
      remoteNote: cloudNote,
      remoteNoteUpdatedAt: noteMap.get(remote.id)?.updatedAt || null,
      forceCreate: false
    });
    setChallenge(nextChallenges, local.id, localNext);
  }
  account.localOnlyIds = [...localOnlyIds].filter((id) => knownLocal.has(id));

  const wasMissing = rawLocal === null;
  for (const [localId, entry] of Object.entries(account.challenges)) {
    if (knownLocal.has(localId) || !entry.cloudId) continue;
    const tombstone = challengeTombstones.get(entry.cloudId);
    const remote = remoteById.get(entry.cloudId);
    if (tombstone || !remote) continue;

    if (wasMissing) {
      const dates = [...(completionMap.get(remote.id) || [])];
      const note = noteMap.get(remote.id)?.content ?? null;
      const id = migrationUuid();
      const local = makeLocalFromCloud(remote, dates, note, id);
      entry.cloudId = remote.id;
      entry.migrationKey = entry.migrationKey || migrationUuid();
      account.challenges[id] = entry;
      delete account.challenges[localId];
      items.push({
        localId: id,
        entry,
        localNext: local,
        originalDates: dates,
        remote,
        remoteNote: note,
        remoteNoteUpdatedAt: noteMap.get(remote.id)?.updatedAt || null,
        forceCreate: false,
        download: true
      });
      setChallenge(nextChallenges, id, local);
      handledCloud.add(remote.id);
      continue;
    }
    const baseline = entry.baseline;
    const deleteAt = pending.challengeDeletes?.[localId];
    const cloudNote = noteMap.get(remote.id)?.content ?? null;
    const cloudNoteHash = await syncNoteHash(cloudNote);
    const cloudDates = [...(completionMap.get(remote.id) || [])].sort();

    const remoteChanged =
      baseline &&
      (!sameSyncValue(cloudFields(remote), baseline.fields) ||
        remote.updatedAt > baseline.challengeUpdatedAt ||
        cloudNoteHash !== baseline.noteHash ||
        !sameSyncValue(cloudDates, [...(baseline.completionDates || [])].sort()));

    const relatedUpdatedAt = [
      remote.updatedAt,
      noteMap.get(remote.id)?.updatedAt,
      ...snapshot.completions.filter((completion) => completion.challengeId === remote.id).map((c) => c.updatedAt)
    ]
      .filter(Boolean)
      .map(Date.parse)
      .reduce((latest, time) => Math.max(latest, time), 0);

    let removeCloud = !remoteChanged || (deleteAt && relatedUpdatedAt <= Date.parse(deleteAt));

    if (remoteChanged && !removeCloud) {
      const conflictTitle = remote.title || entry.baseline?.fields?.title || localId;
      const decision = addSyncConflict(
        conflicts,
        `challenge-delete:${localId}`,
        "delete-local",
        conflictTitle,
        "syncLocalDeleted",
        cloudFields(remote),
        decisions
      );
      removeCloud = decision === "local";
    }

    if (removeCloud) {
      deletions.push({ cloudId: remote.id, localId, expectedUpdatedAt: remote.updatedAt });
    } else {
      const dates = [...(completionMap.get(remote.id) || [])];
      const note = noteMap.get(remote.id)?.content ?? null;
      const local = makeLocalFromCloud(remote, dates, note, localId);
      items.push({
        localId,
        entry,
        localNext: local,
        originalDates: dates,
        remote,
        remoteNote: note,
        remoteNoteUpdatedAt: noteMap.get(remote.id)?.updatedAt || null,
        forceCreate: false,
        download: true
      });
      setChallenge(nextChallenges, localId, local);
    }
    handledCloud.add(remote.id);
  }

  for (const remote of snapshot.challenges) {
    if (handledCloud.has(remote.id) || challengeTombstones.has(remote.id)) continue;
    const dates = [...(completionMap.get(remote.id) || [])];
    const note = noteMap.get(remote.id)?.content ?? null;
    const id = migrationUuid();
    const local = makeLocalFromCloud(remote, dates, note, id);
    const entry = {
      cloudId: remote.id,
      migrationKey: migrationUuid(),
      baseline: null,
      lastSyncedAt: null
    };
    account.challenges[id] = entry;
    items.push({
      localId: id,
      entry,
      localNext: local,
      originalDates: dates,
      remote,
      remoteNote: note,
      remoteNoteUpdatedAt: noteMap.get(remote.id)?.updatedAt || null,
      forceCreate: false,
      download: true
    });
    setChallenge(nextChallenges, id, local);
  }

  const localPrefs = { language: localData.language, remindersEnabled: localData.reminders?.enabled === true };
  const remotePrefs = snapshot.preferences;
  const basePrefs = account.preferencesBaseline;

  const localPrefsChanged = basePrefs
    ? !sameSyncValue(localPrefs, basePrefs.value) ||
      Boolean(pending.preferencesChangedAt && (!account.lastSyncedAt || pending.preferencesChangedAt > account.lastSyncedAt))
    : !sameSyncValue(localPrefs, { language: remotePrefs.language, remindersEnabled: remotePrefs.remindersEnabled });

  const cloudPrefsChanged = basePrefs
    ? !sameSyncValue({ language: remotePrefs.language, remindersEnabled: remotePrefs.remindersEnabled }, basePrefs.value) ||
      Boolean(remotePrefs.updatedAt && basePrefs.updatedAt && remotePrefs.updatedAt > basePrefs.updatedAt)
    : !sameSyncValue(localPrefs, { language: remotePrefs.language, remindersEnabled: remotePrefs.remindersEnabled });

  let selectedPrefs = localPrefs;
  if (localPrefsChanged && cloudPrefsChanged && !sameSyncValue(localPrefs, { language: remotePrefs.language, remindersEnabled: remotePrefs.remindersEnabled })) {
    const localTime = Date.parse(pending.preferencesChangedAt || account.lastSyncedAt || 0);
    const cloudTime = Date.parse(remotePrefs.updatedAt || 0);
    selectedPrefs = localTime > cloudTime ? localPrefs : { language: remotePrefs.language, remindersEnabled: remotePrefs.remindersEnabled };
  } else if (cloudPrefsChanged && !localPrefsChanged) {
    selectedPrefs = { language: remotePrefs.language, remindersEnabled: remotePrefs.remindersEnabled };
  }

  const nextState = {
    version: 1,
    language: selectedPrefs.language,
    challenges: nextChallenges,
    reminders: { ...(localData.reminders || { enabled: false, lastReminderDate: "" }), enabled: selectedPrefs.remindersEnabled }
  };

  const tombstoneChallengeSet = new Set(challengeTombstones.keys());

  for (const item of items) {
    const local = item.localNext;
    const remote = item.forceCreate ? null : item.remote;

    if (remote && tombstoneChallengeSet.has(remote.id)) continue;

    const localDates = new Set(item.originalDates || completionDates(local));
    const remoteDates = remote ? (completionMap.get(remote.id) || new Set()) : new Set();
    const baseDates = new Set(item.entry.baseline?.completionDates || []);
    const merged = new Set([...localDates, ...remoteDates]);

    const completionAdds = pending.completionAdds?.[item.localId] || {};
    const completionDeletes = pending.completionDeletes?.[item.localId] || {};

    for (const date of new Set([...localDates, ...remoteDates, ...baseDates, ...Object.keys(completionAdds), ...Object.keys(completionDeletes)])) {
      const deletion = remote && completionTombstones.get(`${remote.id}|${date}`);
      const addTime = completionAdds[date];
      const deleteTime = completionDeletes[date];

      const localAdded = (!baseDates.has(date) && localDates.has(date)) || Boolean(addTime && (!deletion || addTime > deletion.deletedAt));
      const localRemoved = baseDates.has(date) && !localDates.has(date) && (!addTime || (deleteTime && deleteTime > addTime));

      if (deletion && !localAdded) {
        merged.delete(date);
        continue;
      }
      if (localRemoved) {
        merged.delete(date);
        item.completionDeletes ||= [];
        item.completionDeletes.push(date);
        continue;
      }
      if (localDates.has(date) || remoteDates.has(date)) {
        merged.add(date);
      }
    }

    const dates = [...merged].sort();
    for (const date of dates) {
      const offset = offsetForDate(local.startDate, date);
      if (offset < 1 || offset > local.durationDays) throw new Error("syncScheduleConflict");
    }

    local.completedDays = dates.map((date) => offsetForDate(local.startDate, date)).sort((a, b) => a - b);
    item.completionPosts = dates.filter((date) =>
      !remoteDates.has(date) ||
      Boolean(
        completionTombstones.get(`${remote?.id}|${date}`) &&
        localDates.has(date) &&
        (!item.entry.baseline?.completionDates?.includes(date) ||
          completionAdds[date] > completionTombstones.get(`${remote.id}|${date}`).deletedAt)
      )
    );
    setChallenge(nextChallenges, item.localId, local);
  }

  return {
    conflicts,
    deletions,
    items,
    nextState,
    preferences: { ...selectedPrefs },
    snapshot,
    account,
    localDeletionsApplied
  };
}

export function syncApiError(status) {
  return Object.assign(new Error("syncApi"), { status });
}

export function syncErrorKey(error) {
  if (error?.message === "syncInvalid" || error?.message === "syncStorage" || error?.message === "syncUnsupportedCrypto") {
    return "syncInvalid";
  }
  if (error?.status === 401) return "syncSession";
  if (error?.status === 403) return "cloudPermissionError";
  if (error?.status === 404) return "cloudNotFound";
  if (error?.status === 409) return "syncFailed";
  if (error?.status === 429) return "cloudRateLimited";
  if (error?.status >= 500) return "cloudServerError";
  return typeof navigator !== "undefined" && navigator.onLine ? "syncFailed" : "syncOffline";
}

/**
 * Executes two-way cloud sync with the Streaks Express API.
 * Supports If-Match conditional updates, tombstone tracking, and conflict detection.
 */
export async function runCloudSync({
  token,
  userId,
  decisions = {},
  signal,
  readMigrationSourceFn,
  migrationStoreFn,
  beforeAnalyse
}) {
  if (!token || !userId) throw new Error("Missing authentication credentials");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw Object.assign(new Error("syncOffline"), { status: 0 });
  }

  let changedCount = 0;
  let completionCount = 0;
  let noteCount = 0;
  let cloudWriteStarted = false;

  // 1. Verify session
  const me = await authRequest("/api/auth/me", { token, signal });
  if (me.response.status === 401) throw syncApiError(401);
  if (!me.response.ok || me.payload?.user?.id !== userId) throw new Error("syncInvalid");
  if (me.payload.user.timezone === null) {
    const timezone = detectedTimezone();
    const setTimezone = await authRequest("/api/preferences", {
      method: "PATCH",
      token,
      body: { timezone },
      signal
    });
    if (!setTimezone.response.ok) throw syncApiError(setTimezone.response.status);
  }

  // 2. Read local state and cloud snapshot
  const local = readMigrationSourceFn ? readMigrationSourceFn() : { raw: localStorage.getItem(STORAGE_KEY), source: JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  const store = readSyncMetadata();
  const hadAccountMetadata = Object.hasOwn(store.accounts, userId);
  const account = ensureSyncAccount(store, userId);
  const legacy = migrationStoreFn ? migrationStoreFn().accounts[userId] || null : null;

  const response = await authRequest("/api/sync", { token, signal });
  if (!response.response.ok) throw syncApiError(response.response.status);
  validateCloudSnapshot(response.payload);

  const bootstrap = await beforeAnalyse?.({
    local,
    snapshot: response.payload,
    account,
    store,
    isFirstOnDevice: !hadAccountMetadata &&
      !account.lastSyncedAt &&
      Object.keys(account.challenges).length === 0 &&
      !account.initialSyncHandled
  });
  if (bootstrap?.status === "choice-required") {
    return {
      status: "choice-required",
      localCounts: local.source.challenges.length,
      cloudCounts: response.payload.challenges.length
    };
  }

  // 3. Analyze and 3-way merge
  const plan = await analyseSync(local.source, local.raw, response.payload, account, legacy, decisions);
  const unresolved = plan.conflicts.filter((c) => !Object.hasOwn(decisions, c.key));

  if (unresolved.length) {
    return {
      status: "conflict",
      conflicts: unresolved,
      plan,
      time: response.payload.time,
      timezone: response.payload.preferences.timezone
    };
  }

  // Guard against concurrent local writes during analysis
  if (local.raw !== localStorage.getItem(STORAGE_KEY)) {
    throw new Error("syncDataConflict");
  }

  account.lastSyncedAt = account.lastSyncedAt || null;
  changedCount += plan.localDeletionsApplied || 0;
  if (!saveSyncMetadata(store)) throw new Error("syncStorage");

  // 4. Execute Remote Deletions with If-Match
  for (const deletion of plan.deletions) {
    cloudWriteStarted = true;
    const result = await authRequest(`/api/challenges/${encodeURIComponent(deletion.cloudId)}`, {
      method: "DELETE",
      token,
      headers: { "If-Match": deletion.expectedUpdatedAt },
      signal
    });
    if (!result.response.ok && result.response.status !== 404) {
      throw syncApiError(result.response.status);
    }
    changedCount++;
  }

  // 5. Execute Remote Creations and Updates
  for (const item of plan.items) {
    if (item.download) changedCount++;

    if (item.forceCreate || !item.entry.cloudId) {
      cloudWriteStarted = true;
      const created = await authRequest("/api/challenges", {
        method: "POST",
        token,
        body: {
          title: item.localNext.name,
          description: null,
          duration: item.localNext.durationDays,
          startDate: item.localNext.startDate,
          migrationKey: item.entry.migrationKey
        },
        signal
      });
      if (!created.response.ok || !created.payload?.challenge?.id) {
        throw syncApiError(created.response.status || 500);
      }
      item.entry.cloudId = created.payload.challenge.id;
      item.remote = created.payload.challenge;
      changedCount++;
      if (!saveSyncMetadata(store)) throw new Error("syncStorage");
    }

    const remote = item.remote;
    const fields = {
      title: item.localNext.name,
      duration: item.localNext.durationDays,
      startDate: item.localNext.startDate
    };

    const patch = {};
    if (remote.title !== fields.title) patch.title = fields.title;
    if (remote.duration !== fields.duration) patch.duration = fields.duration;
    if (remote.startDate !== fields.startDate) patch.startDate = fields.startDate;

    if (Object.keys(patch).length) {
      cloudWriteStarted = true;
      const updated = await authRequest(`/api/challenges/${encodeURIComponent(item.entry.cloudId)}`, {
        method: "PATCH",
        token,
        headers: remote.updatedAt ? { "If-Match": remote.updatedAt } : {},
        body: patch,
        signal
      });
      if (!updated.response.ok) throw syncApiError(updated.response.status);
      item.remote = updated.payload.challenge;
      changedCount++;
    }

    for (const date of item.completionDeletes || []) {
      cloudWriteStarted = true;
      const removed = await authRequest(`/api/challenges/${encodeURIComponent(item.entry.cloudId)}/completions/${date}`, {
        method: "DELETE",
        token,
        signal
      });
      if (!removed.response.ok) throw syncApiError(removed.response.status);
      completionCount++;
    }

    for (const date of item.completionPosts || []) {
      cloudWriteStarted = true;
      const added = await authRequest(`/api/challenges/${encodeURIComponent(item.entry.cloudId)}/completions`, {
        method: "POST",
        token,
        body: { completionDate: date },
        signal
      });
      if (!added.response.ok && added.response.status !== 409) {
        throw syncApiError(added.response.status);
      }
      completionCount++;
    }

    const note = Object.hasOwn(item.localNext, "note") ? item.localNext.note : null;
    const oldNote = item.remoteNote ?? null;
    if (note !== oldNote) {
      cloudWriteStarted = true;
      const noteHeaders = item.remoteNoteUpdatedAt ? { "If-Match": item.remoteNoteUpdatedAt } : { "If-None-Match": "*" };
      const result = note === null
        ? await authRequest(`/api/challenges/${encodeURIComponent(item.entry.cloudId)}/notes`, { method: "DELETE", token, headers: noteHeaders, signal })
        : await authRequest(`/api/challenges/${encodeURIComponent(item.entry.cloudId)}/notes`, { method: "PUT", token, headers: noteHeaders, body: { content: note }, signal });
      if (!result.response.ok) throw syncApiError(result.response.status);
      item.remoteNote = note;
      noteCount++;
    }
  }

  // 6. Sync Preferences
  const desiredPrefs = plan.preferences;
  const cloudPrefs = plan.snapshot.preferences;
  const preferencePatch = {};
  if (desiredPrefs.language !== cloudPrefs.language) preferencePatch.language = desiredPrefs.language;
  if (desiredPrefs.remindersEnabled !== cloudPrefs.remindersEnabled) preferencePatch.remindersEnabled = desiredPrefs.remindersEnabled;

  if (Object.keys(preferencePatch).length) {
    cloudWriteStarted = true;
    const prefs = await authRequest("/api/preferences", {
      method: "PATCH",
      token,
      body: preferencePatch,
      signal
    });
    if (!prefs.response.ok) throw syncApiError(prefs.response.status);
    changedCount++;
  }

  // 7. Final snapshot re-fetch for true baselines
  const final = await authRequest("/api/sync", { token, signal });
  if (!final.response.ok) throw syncApiError(final.response.status);
  validateCloudSnapshot(final.payload);

  if (local.raw !== localStorage.getItem(STORAGE_KEY)) {
    throw new Error("syncDataConflict");
  }

  const cloudById = new Map(final.payload.challenges.map((c) => [c.id, c]));
  const finalCompletions = new Map();
  for (const item of final.payload.completions) {
    if (!finalCompletions.has(item.challengeId)) finalCompletions.set(item.challengeId, []);
    finalCompletions.get(item.challengeId).push(item.completionDate);
  }
  const finalNotes = new Map(final.payload.notes.map((item) => [item.challengeId, item.note]));

  for (const [localId, entry] of Object.entries(account.challenges)) {
    const localChallenge = plan.nextState.challenges.find((c) => c.id === localId);
    if (!localChallenge) {
      if (!entry.cloudId || !cloudById.has(entry.cloudId) || plan.snapshot.tombstones.some((t) => t.entityType === "challenge" && t.entityKey === entry.cloudId)) {
        delete account.challenges[localId];
      }
      continue;
    }
    if (!entry.cloudId) continue;
    const remote = cloudById.get(entry.cloudId);
    if (!remote) continue;

    entry.baseline = {
      fields: cloudFields(remote),
      challengeUpdatedAt: remote.updatedAt,
      completionDates: [...(finalCompletions.get(remote.id) || [])].sort(),
      noteHash: await syncNoteHash(finalNotes.get(remote.id)?.content ?? null),
      noteUpdatedAt: finalNotes.get(remote.id)?.updatedAt || null
    };
    entry.lastSyncedAt = new Date().toISOString();
  }

  account.preferencesBaseline = {
    value: desiredPrefs,
    updatedAt: final.payload.preferences.updatedAt
  };
  account.lastSyncedAt = new Date().toISOString();
  account.pending = {
    challengeChanges: {},
    noteChanges: {},
    challengeDeletes: {},
    completionAdds: {},
    completionDeletes: {},
    preferencesChangedAt: null
  };

  // 8. Commit local storage with applyingSyncState lock
  try {
    const committed = await commitIfUnchanged(local.raw, plan.nextState);
    if (!committed.ok) {
      throw new Error(committed.error?.code === "storage-conflict" ? "syncDataConflict" : "syncLocalWrite");
    }
  } catch (error) {
    if (error?.message === "syncDataConflict") throw error;
    throw new Error("syncLocalWrite");
  }

  if (!saveSyncMetadata(store)) throw new Error("syncStorage");

  return {
    status: "complete",
    counts: {
      challenges: changedCount,
      completions: completionCount,
      notes: noteCount,
      conflicts: Object.keys(decisions).length
    },
    nextState: plan.nextState,
    lastSyncedAt: account.lastSyncedAt,
    time: final.payload.time,
    timezone: final.payload.preferences.timezone
  };
}
