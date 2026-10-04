import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Import migrated modules
import { i18n, t, createTranslator } from "../src/i18n/index.js";
import { en } from "../src/i18n/en.js";
import { ar } from "../src/i18n/ar.js";
import {
  DAY_MS,
  localToday,
  validDate,
  dateValue,
  dayIndex,
  elapsed,
  migrationDate,
  offsetForDate
} from "../src/utils/date.js";
import {
  progress,
  streakStats,
  status,
  remaining
} from "../src/utils/streakCalculations.js";
import {
  STORAGE_KEY,
  BACKUP_PREFIX,
  VERSION,
  validTimestamp,
  validChallenge,
  validImportChallenge,
  load,
  persist,
  saveRawBackup,
  isApplyingSyncState,
  setApplyingSyncState,
  createInitialState,
  mutateState,
  loadRawValue,
  commitIfUnchanged
} from "../src/services/storage.js";
import {
  AUTH_SESSION_KEY,
  AUTH_TOKEN_KEY,
  readAuthToken,
  readAuthSession,
  saveAuthSession,
  clearAuthToken,
  validAuthUser
} from "../src/services/authStorage.js";
import { restoreAuthSession } from "../src/services/authSession.js";
import { runCloudSync } from "../src/services/sync.js";
import {
  LOCAL_MUTATION_EVENT,
  subscribeLocalMutations
} from "../src/services/localMutationEvents.js";
import {
  classifyInitialSync,
  createSyncTriggers,
  markLocalChallengesOnly,
  retryAfterAuthRefresh,
  withSyncLock
} from "../src/services/syncAutomation.js";
import {
  completeGoogleLogin,
  GOOGLE_IDENTITY_SCRIPT_URL,
  loadGoogleIdentity,
  shouldShowGoogleSignIn
} from "../src/services/googleAuth.js";
import {
  SYNC_META_KEY,
  SYNC_UUID_PATTERN,
  sameSyncValue,
  cloudFields,
  localSyncFields,
  completionDates,
  syncNoteHash,
  validateCloudSnapshot,
  readSyncMetadata,
  saveSyncMetadata,
  ensureSyncAccount,
  captureSyncMutations,
  analyseSync
} from "../src/services/sync.js";
import {
  MIGRATION_KEY,
  readMigrationSource,
  migrationStore,
  saveMigrationStore
} from "../src/services/cloudBackup.js";

// Extract original Vanilla functions for 100% equivalence comparison
const vanillaHtml = fs.readFileSync("index.vanilla.html", "utf8");
const scriptStart = vanillaHtml.indexOf("<script>") + 8;
const scriptEnd = vanillaHtml.lastIndexOf("</script>");
let vanillaScript = vanillaHtml.slice(scriptStart, scriptEnd);
if (vanillaScript.includes("// events")) {
  vanillaScript = vanillaScript.slice(0, vanillaScript.indexOf("// events"));
}

// Setup mock window/document/localStorage/sessionStorage environment for testing
class MockStorage {
  constructor() {
    this.store = new Map();
  }
  get length() {
    return this.store.size;
  }
  key(index) {
    return [...this.store.keys()][index] ?? null;
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    if (this.failSetItem?.(String(key), String(value))) {
      const error = new Error("Storage quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

globalThis.localStorage = new MockStorage();
globalThis.sessionStorage = new MockStorage();
globalThis.window = {
  location: { hostname: "localhost", port: "8080", origin: "http://localhost:8080", protocol: "http:" }
};
globalThis.location = globalThis.window.location;
globalThis.document = {
  querySelector: (sel) => {
    if (sel.includes("streaks-api-base-url")) {
      return { content: "https://streaks-api-7213.onrender.com" };
    }
    return null;
  }
};

// Evaluate vanilla functions in a sandbox function
const vanillaFn = new Function(`
  const window = globalThis.window;
  const document = globalThis.document;
  const localStorage = globalThis.localStorage;
  const sessionStorage = globalThis.sessionStorage;
  ${vanillaScript}
  return {
    i18n,
    t,
    localToday,
    validDate,
    dateValue,
    dayIndex,
    elapsed,
    migrationDate,
    offsetForDate,
    progress,
    streakStats,
    status,
    remaining,
    validTimestamp,
    validChallenge,
    validImportChallenge,
    sameSyncValue,
    cloudFields,
    localSyncFields,
    validateCloudSnapshot
  };
`);

const vanilla = vanillaFn();

test("1. i18n Translation Dictionary Equivalence", () => {
  const enKeys = Object.keys(en);
  const arKeys = Object.keys(ar);
  const vanillaEnKeys = Object.keys(vanilla.i18n.en);
  const vanillaArKeys = Object.keys(vanilla.i18n.ar);

  assert.equal(enKeys.length, 240, "English key count must include timezone, chart, landing, auth, Google, sync, and profile labels");
  assert.equal(arKeys.length, 240, "Arabic key count must include timezone, chart, landing, auth, Google, sync, and profile labels");
  assert.equal(vanillaEnKeys.length, 173);
  assert.equal(vanillaArKeys.length, 173);

  for (const k of vanillaEnKeys) {
    assert.equal(en[k], vanilla.i18n.en[k], `Mismatch in EN key ${k}`);
    assert.equal(ar[k], vanilla.i18n.ar[k], `Mismatch in AR key ${k}`);
  }
  assert.equal(typeof en.quarantinedWarning, "string");
  assert.equal(typeof ar.quarantinedWarning, "string");
  assert.equal(typeof en.timezoneUseCurrent, "string");
  assert.equal(typeof ar.timezoneUseCurrent, "string");
  assert.equal(typeof en.lastSevenDays, "string");
  assert.equal(typeof ar.lastSevenDays, "string");
  assert.equal(typeof en.weekBarsDescription, "string");
  assert.equal(typeof ar.weekBarsDescription, "string");
  assert.equal(typeof en.authShowPassword, "string");
  assert.equal(typeof ar.authShowPassword, "string");
  assert.equal(typeof en.authHidePassword, "string");
  assert.equal(typeof ar.authHidePassword, "string");

  // Test interpolation
  assert.equal(t("dayOf", { day: 5, total: 30 }, "en"), "Day 5 of 30");
  assert.equal(t("dayOf", { day: 5, total: 30 }, "ar"), "اليوم 5 من 30");
  assert.equal(t("percent", { percent: 75 }, "en"), "75%");
  assert.equal(t("percent", { percent: 75 }, "ar"), "75٪");
  assert.equal(t("nonExistentKey", {}, "en"), "nonExistentKey");

  // Test createTranslator
  const tAr = createTranslator("ar");
  assert.equal(tAr("welcomeTitle"), "Streaks");
  assert.equal(tAr("active"), "نشط");
});

test("2. Date Utilities Equivalence", () => {
  assert.equal(localToday(), vanilla.localToday());

  // validDate boundary tests
  const testDates = [
    "2026-10-03", "2024-02-29", "2023-02-29", "2026-04-30", "2026-04-31",
    "2026-12-31", "2026-13-01", "2026-00-10", "invalid-date", "", null, undefined
  ];
  for (const d of testDates) {
    assert.equal(validDate(d), vanilla.validDate(d), `validDate mismatch for: ${d}`);
  }

  // dateValue tests
  for (const d of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
    assert.equal(dateValue(d), vanilla.dateValue(d), `dateValue mismatch for: ${d}`);
  }

  // dayIndex and elapsed tests
  const sampleChallenges = [
    { startDate: "2026-10-01", durationDays: 30 },
    { startDate: "2026-10-03", durationDays: 30 },
    { startDate: "2026-10-10", durationDays: 14 }, // future
    { startDate: "2026-01-01", durationDays: 10 }  // past/ended
  ];

  for (const c of sampleChallenges) {
    assert.equal(dayIndex(c), vanilla.dayIndex(c), `dayIndex mismatch for ${JSON.stringify(c)}`);
    assert.equal(elapsed(c), vanilla.elapsed(c), `elapsed mismatch for ${JSON.stringify(c)}`);
  }

  // offsetForDate and migrationDate
  const startDate = "2026-10-01";
  for (let offset = 1; offset <= 30; offset++) {
    const d = migrationDate(startDate, offset);
    assert.equal(d, vanilla.migrationDate(startDate, offset));
    assert.equal(offsetForDate(startDate, d), offset);
    assert.equal(offsetForDate(startDate, d), vanilla.offsetForDate(startDate, d));
  }
});

test("3. Streak and Habit Calculation Equivalence", () => {
  const challenge1 = {
    startDate: "2026-10-01",
    durationDays: 30,
    completedDays: [1, 2, 3]
  };
  const challenge2 = {
    startDate: "2026-09-01",
    durationDays: 30,
    completedDays: Array.from({ length: 30 }, (_, i) => i + 1) // 100% complete
  };
  const challenge3 = {
    startDate: "2026-09-20",
    durationDays: 30,
    completedDays: [1, 2, 4, 5, 8] // with gaps
  };
  const challenge4 = {
    startDate: "2026-10-10",
    durationDays: 7,
    completedDays: [] // future / not started
  };

  const testCases = [challenge1, challenge2, challenge3, challenge4];

  for (const c of testCases) {
    assert.equal(progress(c), vanilla.progress(c), `progress mismatch for: ${JSON.stringify(c)}`);
    assert.deepEqual(streakStats(c), vanilla.streakStats(c), `streakStats mismatch for: ${JSON.stringify(c)}`);
    assert.equal(status(c), vanilla.status(c), `status mismatch for: ${JSON.stringify(c)}`);
    assert.equal(remaining(c), vanilla.remaining(c), `remaining mismatch for: ${JSON.stringify(c)}`);
  }
});

test("4. Storage Service - Validation, Schema Safety, and Persistence", () => {
  localStorage.clear();

  // Empty storage returns a successful clean default without writing.
  const initial = load();
  assert.equal(initial.ok, true);
  assert.equal(initial.state.version, 1);
  assert.equal(initial.state.language, "en");
  assert.deepEqual(initial.state.challenges, []);
  assert.equal(localStorage.getItem(STORAGE_KEY), null, "load() must never write to localStorage");

  // Test validChallenge
  const valid = {
    id: "uuid-1234",
    name: "Exercise Daily",
    durationDays: 30,
    startDate: "2026-10-01",
    completedDays: [1, 2, 3],
    createdAt: "2026-10-01T10:00:00.000Z",
    note: "Feel great"
  };
  assert.equal(validChallenge(valid), true);
  assert.equal(validChallenge({ ...valid, durationDays: 0 }), false);
  assert.equal(validChallenge({ ...valid, durationDays: 366 }), false);
  assert.equal(validChallenge({ ...valid, completedDays: [1, 1, 2] }), false); // duplicate
  assert.equal(validChallenge({ ...valid, completedDays: [31] }), false); // out of range
  assert.equal(validChallenge({ ...valid, createdAt: "2026-10-01" }), false); // not ISO UTC

  // Test persistence
  const sampleState = {
    version: 1,
    language: "ar",
    challenges: [valid],
    reminders: { enabled: true, lastReminderDate: "2026-10-03" }
  };

  const persisted = persist(sampleState);
  assert.deepEqual(persisted, { ok: true, error: null });
  assert.ok(localStorage.getItem(STORAGE_KEY));

  // Reload and verify identical state
  const loaded = load();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.version, 1);
  assert.equal(loaded.state.language, "ar");
  assert.equal(loaded.state.challenges.length, 1);
  assert.equal(loaded.state.challenges[0].name, "Exercise Daily");
  assert.equal(Object.hasOwn(loaded.state, "reminders"), false);
  assert.equal(Object.hasOwn(JSON.parse(localStorage.getItem(STORAGE_KEY)), "reminders"), false);
});

test("Storage recovery preserves corrupt JSON and rejects unsupported newer versions", () => {
  localStorage.clear();
  const corrupt = "{not-json";
  localStorage.setItem(STORAGE_KEY, corrupt);
  const badJson = load();
  assert.equal(badJson.ok, false);
  assert.equal(badJson.error.code, "invalid-json");
  assert.equal(badJson.raw, corrupt);
  assert.equal(localStorage.getItem(STORAGE_KEY), corrupt);

  const newer = JSON.stringify({ version: VERSION + 1, challenges: [] });
  localStorage.setItem(STORAGE_KEY, newer);
  const future = load();
  assert.equal(future.ok, false);
  assert.equal(future.error.code, "unsupported-version");
  assert.equal(localStorage.getItem(STORAGE_KEY), newer);
});

test("Version 0 data is backed up before migration to version 1", () => {
  localStorage.clear();
  const legacy = JSON.stringify({
    language: "ar",
    challenges: [],
    reminders: { enabled: true }
  });
  localStorage.setItem(STORAGE_KEY, legacy);

  const result = load();
  assert.equal(result.ok, true);
  assert.equal(result.state.version, VERSION);
  assert.equal(result.state.language, "ar");
  assert.equal(Object.hasOwn(JSON.parse(localStorage.getItem(STORAGE_KEY)), "reminders"), false);
  assert.ok(localStorage.getItem(`${BACKUP_PREFIX}${Date.now()}`) === legacy ||
    [...localStorage.store.keys()].some((key) => key.startsWith(BACKUP_PREFIX) && localStorage.getItem(key) === legacy));
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).version, VERSION);
});

test("Backup rotation keeps three newest backups and retries quota once after removing oldest", () => {
  localStorage.clear();
  localStorage.setItem(`${BACKUP_PREFIX}100`, "oldest");
  localStorage.setItem(`${BACKUP_PREFIX}200`, "middle");
  localStorage.setItem(`${BACKUP_PREFIX}300`, "newest");

  const result = saveRawBackup("fresh");
  assert.equal(result.ok, true);
  let keys = [...localStorage.store.keys()].filter((key) => key.startsWith(BACKUP_PREFIX));
  assert.equal(keys.length, 3);
  assert.equal(localStorage.getItem(`${BACKUP_PREFIX}100`), null);
  assert.equal(localStorage.getItem(result.key), "fresh");

  localStorage.clear();
  localStorage.setItem(`${BACKUP_PREFIX}100`, "oldest");
  localStorage.setItem(`${BACKUP_PREFIX}200`, "newest");
  let quotaOnce = true;
  localStorage.failSetItem = (key) => {
    if (key.startsWith(BACKUP_PREFIX) && quotaOnce) {
      quotaOnce = false;
      return true;
    }
    return false;
  };
  const retried = saveRawBackup("after-quota");
  localStorage.failSetItem = null;
  assert.equal(retried.ok, true);
  assert.equal(localStorage.getItem(`${BACKUP_PREFIX}100`), null);
  assert.equal(localStorage.getItem(retried.key), "after-quota");
});

test("Migration write failure after successful backup preserves original streaks-data", () => {
  localStorage.clear();
  const original = JSON.stringify({ language: "en", challenges: [], reminders: { enabled: false } });
  localStorage.setItem(STORAGE_KEY, original);
  localStorage.failSetItem = (key) => key === STORAGE_KEY;

  const result = load();
  localStorage.failSetItem = null;

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "migration-write-failed");
  assert.equal(localStorage.getItem(STORAGE_KEY), original);
  assert.ok([...localStorage.store.keys()].some(
    (key) => key.startsWith(BACKUP_PREFIX) && localStorage.getItem(key) === original
  ));
});

test("QuotaExceeded while persisting returns an error and preserves prior data", () => {
  localStorage.clear();
  const original = JSON.stringify({ version: VERSION, language: "en", challenges: [], reminders: { enabled: false } });
  localStorage.setItem(STORAGE_KEY, original);
  localStorage.failSetItem = (key) => key === STORAGE_KEY;

  const result = persist({ ...JSON.parse(original), language: "ar" });
  localStorage.failSetItem = null;

  assert.equal(result.ok, false);
  assert.equal(result.error.name, "QuotaExceededError");
  assert.equal(localStorage.getItem(STORAGE_KEY), original);
});

test("mutations serialize and apply each toggle to the latest stored challenge", async () => {
  localStorage.clear();
  const challenge = {
    id: "multi-tab-challenge",
    name: "Read",
    durationDays: 7,
    startDate: "2026-10-01",
    completedDays: [],
    createdAt: "2026-10-01T10:00:00.000Z"
  };
  persist({ ...createInitialState(), challenges: [challenge] });

  const toggle = (day) => mutateState((current) => {
    const item = current.challenges[0];
    const completedDays = item.completedDays.includes(day)
      ? item.completedDays.filter((value) => value !== day)
      : [...item.completedDays, day].sort((a, b) => a - b);
    return {
      state: {
        ...current,
        challenges: [{ ...item, completedDays }]
      }
    };
  });

  const [first, second] = await Promise.all([toggle(1), toggle(2)]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(load().state.challenges[0].completedDays, [1, 2]);
});

test("mutate retries from a changed revision and reapplies the operation", async () => {
  localStorage.clear();
  persist(createInitialState());
  let calls = 0;
  const result = await mutateState((current) => {
    calls++;
    if (calls === 1) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, language: "ar" }));
    }
    return { state: { ...current, language: "ar" } };
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.state.language, "ar");
  assert.equal(Object.hasOwn(result.state, "reminders"), false);
  assert.equal(Object.hasOwn(JSON.parse(localStorage.getItem(STORAGE_KEY)), "reminders"), false);
});

test("mutate enters recovery on corrupt or unsupported cross-tab data without overwriting it", async () => {
  for (const raw of ["{broken", JSON.stringify({ version: VERSION + 1, challenges: [] })]) {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, raw);
    const result = await mutateState((current) => ({ state: { ...current, language: "ar" } }));
    assert.equal(result.ok, false);
    assert.ok(result.loadResult);
    assert.equal(localStorage.getItem(STORAGE_KEY), raw);
    assert.equal(loadRawValue(raw).ok, false);
  }
});

test("revision retries do not create backups for valid stored data", async () => {
  localStorage.clear();
  persist(createInitialState());
  let calls = 0;
  const result = await mutateState((current) => {
    calls++;
    if (calls === 1) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, language: "ar" }));
    }
    return { state: { ...current, language: "ar" } };
  });
  assert.equal(result.ok, true);
  assert.equal([...localStorage.store.keys()].filter((key) => key.startsWith(BACKUP_PREFIX)).length, 0);
});

test("mutations use Web Locks when available", async () => {
  localStorage.clear();
  persist(createInitialState());
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const requestedLocks = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: async (name, options, operation) => {
          requestedLocks.push({ name, options });
          return operation();
        }
      }
    }
  });

  try {
    const result = await mutateState((current) => ({
      state: { ...current, language: "ar" }
    }));
    assert.equal(result.ok, true);
    assert.deepEqual(requestedLocks, [{
      name: `${STORAGE_KEY}-mutate`,
      options: { mode: "exclusive" }
    }]);
  } finally {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  }
});

test("guarded commits refuse to overwrite storage changed by another tab", async () => {
  localStorage.clear();
  const initial = createInitialState();
  persist(initial);
  const originalRaw = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initial, language: "ar" }));

  const result = await commitIfUnchanged(originalRaw, {
    ...initial,
    reminders: { enabled: true, lastReminderDate: "" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "storage-conflict");
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).language, "ar");
});

test("Invalid challenge is quarantined while two valid challenges load", () => {
  localStorage.clear();
  const validChallenge = (id) => ({
    id,
    name: id,
    durationDays: 7,
    startDate: "2026-10-01",
    completedDays: [],
    createdAt: "2026-10-01T10:00:00.000Z"
  });
  const raw = JSON.stringify({
    version: VERSION,
    language: "en",
    challenges: [validChallenge("one"), { ...validChallenge("bad"), durationDays: 0 }, validChallenge("three")],
    reminders: { enabled: false }
  });
  localStorage.setItem(STORAGE_KEY, raw);

  const result = load();
  assert.equal(result.ok, true);
  assert.equal(result.state.challenges.length, 2);
  assert.equal(result.quarantinedCount, 1);
  assert.ok([...localStorage.store.keys()].some(
    (key) => key.startsWith(BACKUP_PREFIX) && localStorage.getItem(key) === raw
  ));
});

test("5. Auth Storage - persistent localStorage session", () => {
  sessionStorage.clear();
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  assert.equal(readAuthToken(), null);

  const testToken = "jwt.header.payload.signature";
  const testSession = {
    token: testToken,
    refreshToken: "opaque-refresh-token",
    user: { id: "user-1", email: "test@example.com", timezone: "Africa/Khartoum" }
  };
  assert.equal(saveAuthSession(testSession), true);
  assert.equal(readAuthToken(), testToken);
  assert.deepEqual(readAuthSession(), testSession);
  assert.equal(localStorage.getItem(AUTH_SESSION_KEY), JSON.stringify(testSession));
  assert.equal(sessionStorage.getItem(AUTH_TOKEN_KEY), null);

  clearAuthToken();
  assert.equal(readAuthToken(), null);
  assert.equal(localStorage.getItem(AUTH_SESSION_KEY), null);

  sessionStorage.setItem(AUTH_TOKEN_KEY, testToken);
  assert.equal(readAuthToken(), testToken);
  assert.equal(localStorage.getItem(AUTH_SESSION_KEY), JSON.stringify({
    token: testToken,
    refreshToken: null,
    user: null
  }), "A legacy session token is migrated to persistent storage");
  assert.equal(sessionStorage.getItem(AUTH_TOKEN_KEY), null);

  assert.equal(validAuthUser({ id: "user-1", email: "test@example.com" }), true);
  assert.equal(validAuthUser({ id: "user-1", email: "test@example.com", timezone: "Africa/Khartoum" }), true);
  assert.equal(validAuthUser({ id: "user-1", email: "a".repeat(300) }), false);
  assert.equal(validAuthUser(null), false);
});

test("Auth session restores after reload and rotates tokens after a 401", async () => {
  const initialSession = {
    token: "expired-access-token",
    refreshToken: "valid-refresh-token",
    user: { id: "user-1", email: "test@example.com" }
  };
  saveAuthSession(initialSession);
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === "/api/auth/me" && calls.length === 1) {
      return { response: { status: 401, ok: false }, payload: null };
    }
    if (path === "/api/auth/refresh") {
      return {
        response: { status: 200, ok: true },
        payload: {
          token: "new-access-token",
          refreshToken: "new-refresh-token",
          user: { id: "user-1", email: "test@example.com", timezone: "Africa/Khartoum" }
        }
      };
    }
    return {
      response: { status: 200, ok: true },
      payload: {
        user: { id: "user-1", email: "test@example.com", timezone: "Africa/Khartoum", addedLater: true },
        time: { today: "2026-10-04" }
      }
    };
  };

  const restored = await restoreAuthSession(readAuthSession(), request);
  assert.equal(restored.kind, "authenticated");
  assert.equal(restored.session.token, "new-access-token");
  assert.equal(restored.session.refreshToken, "new-refresh-token");
  assert.equal(restored.session.user.addedLater, true);
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/auth/me",
    "/api/auth/refresh",
    "/api/auth/me"
  ]);
  assert.equal(readAuthSession().token, "new-access-token");
});

test("A 401 from refresh ends the saved session", async () => {
  saveAuthSession({
    token: "expired-access-token",
    refreshToken: "expired-refresh-token",
    user: { id: "user-1", email: "test@example.com" }
  });
  const restored = await restoreAuthSession(readAuthSession(), async (path) => ({
    response: { status: 401, ok: false },
    payload: null
  }));
  assert.equal(restored.kind, "expired");
  assert.equal(readAuthSession(), null);
});

test("A network failure during restore preserves the saved session", async () => {
  const saved = {
    token: "still-valid-access-token",
    refreshToken: "still-valid-refresh-token",
    user: { id: "user-1", email: "test@example.com" }
  };
  saveAuthSession(saved);
  const restored = await restoreAuthSession(readAuthSession(), async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(restored.kind, "unavailable");
  assert.deepEqual(readAuthSession(), saved);
});

test("A server error during restore preserves the saved session", async () => {
  const saved = {
    token: "still-valid-access-token",
    refreshToken: "still-valid-refresh-token",
    user: { id: "user-1", email: "test@example.com" }
  };
  saveAuthSession(saved);
  const restored = await restoreAuthSession(readAuthSession(), async () => ({
    response: { status: 503, ok: false },
    payload: null
  }));
  assert.equal(restored.kind, "unavailable");
  assert.deepEqual(readAuthSession(), saved);
});

test("Automatic sync debounce batches mutations and focus cadence is at least one minute", async () => {
  const windowObject = new EventTarget();
  const documentObject = new EventTarget();
  documentObject.visibilityState = "visible";
  const calls = [];
  let mutationCallback;
  let now = 100000;
  const cleanup = createSyncTriggers({
    startSync: (trigger) => calls.push(trigger),
    windowObject,
    documentObject,
    subscribeMutations: (callback) => {
      mutationCallback = callback;
      return () => { mutationCallback = null; };
    },
    debounceMs: 20,
    now: () => now
  });

  windowObject.dispatchEvent(new Event("focus"));
  documentObject.dispatchEvent(new Event("visibilitychange"));
  now += 59000;
  windowObject.dispatchEvent(new Event("focus"));
  now += 1000;
  documentObject.dispatchEvent(new Event("visibilitychange"));
  windowObject.dispatchEvent(new Event("online"));

  mutationCallback();
  mutationCallback();
  await new Promise((resolve) => setTimeout(resolve, 35));
  cleanup();
  assert.deepEqual(calls, ["focus", "focus", "online", "mutation"]);
  assert.equal(mutationCallback, null);
});

test("Initial sync classification distinguishes choice, merge, and download", () => {
  assert.equal(classifyInitialSync({ localCount: 4, cloudCount: 0 }), "choose");
  assert.equal(classifyInitialSync({ localCount: 4, cloudCount: 2 }), "merge");
  assert.equal(classifyInitialSync({ localCount: 0, cloudCount: 2 }), "download");
  assert.equal(classifyInitialSync({ localCount: 0, cloudCount: 0 }), "sync");
  assert.equal(classifyInitialSync({ localCount: 4, cloudCount: 0, alreadyHandled: true }), "sync");
});

test("Starting with an empty cloud account preserves and marks existing local records only", () => {
  const account = {
    pending: {
      preferencesChangedAt: "old-change",
      challengeChanges: {},
      noteChanges: {},
      challengeDeletes: {},
      completionAdds: {},
      completionDeletes: {}
    }
  };
  const local = {
    source: {
      language: "ar",
      challenges: [{ id: "local-1" }, { id: "local-2" }]
    }
  };
  const snapshot = {
    preferences: { updatedAt: "2026-10-04T10:00:00.000Z" }
  };
  markLocalChallengesOnly(account, local, snapshot);
  assert.equal(account.initialSyncHandled, "empty");
  assert.deepEqual(account.localOnlyIds, ["local-1", "local-2"]);
  assert.deepEqual(account.preferencesBaseline.value, {
    language: "ar"
  });
  assert.equal(account.pending.preferencesChangedAt, null);
});

test("Sync Web Locks serialize overlapping tab requests", async () => {
  let queue = Promise.resolve();
  let active = 0;
  let maximumActive = 0;
  const lockManager = {
    request(_name, _options, callback) {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      return previous.then(async () => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        try {
          await callback();
        } finally {
          active--;
          release();
        }
      });
    }
  };
  await Promise.all([
    withSyncLock("account-1", async () => new Promise((resolve) => setTimeout(resolve, 15)), lockManager),
    withSyncLock("account-1", async () => new Promise((resolve) => setTimeout(resolve, 15)), lockManager)
  ]);
  assert.equal(maximumActive, 1);
});

test("A sync 401 refreshes the session and retries exactly once", async () => {
  let session = { token: "expired-token" };
  let requests = 0;
  const result = await retryAfterAuthRefresh(
    async (token) => {
      requests++;
      if (token === "expired-token") throw Object.assign(new Error("unauthorized"), { status: 401 });
      return { token };
    },
    async () => { session = { token: "refreshed-token" }; },
    () => session,
    session.token
  );
  assert.deepEqual(result, { token: "refreshed-token" });
  assert.equal(requests, 2);
});

test("Sync failures leave local challenge data unchanged", async () => {
  localStorage.clear();
  const original = JSON.stringify(createInitialState());
  localStorage.setItem(STORAGE_KEY, original);
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  try {
    await assert.rejects(runCloudSync({
      token: "access-token",
      userId: "user-1",
      readMigrationSourceFn: () => ({
        raw: original,
        source: JSON.parse(original),
        counts: { challenges: 0, completions: 0, notes: 0 }
      })
    }), (error) => error.message === "syncOffline");
    assert.equal(localStorage.getItem(STORAGE_KEY), original);
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
    else delete globalThis.fetch;
  }
});

test("Only user mutations publish sync triggers; sync-applied state does not", async () => {
  const previousWindow = globalThis.window;
  const previousBroadcastChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis, "BroadcastChannel", {
    value: undefined,
    configurable: true,
    writable: true
  });
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createInitialState()));
  let mutationEvents = 0;
  const unsubscribe = subscribeLocalMutations(() => { mutationEvents++; });
  try {
    const mutation = await mutateState((current) => ({ ...current, language: "ar" }));
    assert.equal(mutation.ok, true);
    assert.equal(mutationEvents, 1);

    const expectedRaw = localStorage.getItem(STORAGE_KEY);
    const syncCommit = await commitIfUnchanged(expectedRaw, {
      ...JSON.parse(expectedRaw),
      language: "en"
    });
    assert.equal(syncCommit.ok, true);
    assert.equal(mutationEvents, 1);
    assert.equal(LOCAL_MUTATION_EVENT, "streaks:local-mutation");
  } finally {
    unsubscribe();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousBroadcastChannel) {
      Object.defineProperty(globalThis, "BroadcastChannel", previousBroadcastChannel);
    } else {
      delete globalThis.BroadcastChannel;
    }
  }
});

test("Google sign-in stays hidden without a client ID or outside the login view", () => {
  assert.equal(shouldShowGoogleSignIn("", "login"), false);
  assert.equal(shouldShowGoogleSignIn(undefined, "login"), false);
  assert.equal(shouldShowGoogleSignIn("public-client-id", "register"), false);
  assert.equal(shouldShowGoogleSignIn("public-client-id", "login"), true);
});

test("Google Identity script load failures remain recoverable", async () => {
  const listeners = {};
  const script = {
    src: "",
    isConnected: false,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    removeEventListener: (name) => { delete listeners[name]; }
  };
  const documentObject = {
    querySelector: () => null,
    createElement: () => script,
    head: { appendChild: () => {} }
  };
  const load = loadGoogleIdentity({ documentObject, windowObject: {} });
  assert.equal(script.src, GOOGLE_IDENTITY_SCRIPT_URL);
  listeners.error();
  await assert.rejects(load, /could not be loaded/);
});

test("Google login sends a credential and saves the returned shared session", async () => {
  localStorage.removeItem(AUTH_SESSION_KEY);
  let accepted = false;
  const result = await completeGoogleLogin({
    credential: "signed-google-credential",
    request: async (path, options) => {
      assert.equal(path, "/api/auth/google");
      assert.deepEqual(options.body, { credential: "signed-google-credential" });
      return {
        response: { status: 200, ok: true },
        payload: {
          token: "google-access-token",
          refreshToken: "google-refresh-token",
          user: { id: "google-user", email: "google@example.com" }
        }
      };
    },
    acceptSession: (payload) => {
      accepted = saveAuthSession({
        token: payload.token,
        refreshToken: payload.refreshToken,
        user: payload.user
      });
      return { success: true };
    }
  });
  assert.equal(result.success, true);
  assert.equal(accepted, true);
  assert.equal(readAuthSession().token, "google-access-token");
  assert.equal(readAuthSession().refreshToken, "google-refresh-token");
});

test("6. Cloud Sync - Snapshot Validation and 3-Way Merge", async () => {
  const validSnapshot = {
    challenges: [
      {
        id: "11111111-2222-4333-8444-555555555555",
        title: "Cloud Challenge",
        description: null,
        duration: 30,
        startDate: "2026-10-01",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z"
      }
    ],
    completions: [
      {
        challengeId: "11111111-2222-4333-8444-555555555555",
        completionDate: "2026-10-01",
        updatedAt: "2026-10-01T00:00:00.000Z"
      }
    ],
    notes: [
      {
        challengeId: "11111111-2222-4333-8444-555555555555",
        note: { content: "Cloud note", updatedAt: "2026-10-01T00:00:00.000Z" }
      }
    ],
    tombstones: [],
    preferences: { language: "en", timezone: null, updatedAt: null },
    time: {
      today: "2026-10-03",
      serverNow: "2026-10-03T12:00:00.000Z",
      nextMidnightAt: "2026-10-04T00:00:01.000Z"
    }
  };

  assert.doesNotThrow(() => validateCloudSnapshot(validSnapshot));
  assert.doesNotThrow(() => validateCloudSnapshot({
    ...validSnapshot,
    completions: [{ ...validSnapshot.completions[0], completionDate: "2026-10-04" }]
  }));
  assert.throws(() => validateCloudSnapshot({
    ...validSnapshot,
    completions: [{ ...validSnapshot.completions[0], completionDate: "2026-10-05" }]
  }), /syncInvalid/);

  // Invalid snapshots should throw syncInvalid
  assert.throws(() => validateCloudSnapshot(null), /syncInvalid/);
  assert.throws(() => validateCloudSnapshot({ ...validSnapshot, challenges: "bad" }), /syncInvalid/);

  // Test note hash calculation
  const hash1 = await syncNoteHash("test note");
  const hash2 = await syncNoteHash("test note");
  const hash3 = await syncNoteHash("different note");
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(await syncNoteHash(null), null);

  // Test analyseSync (download new cloud challenge to local)
  const emptyLocal = { version: 1, language: "en", challenges: [] };
  const syncStore = { version: 1, accounts: {} };
  const syncAccount = ensureSyncAccount(syncStore, "user-123");

  const plan = await analyseSync(emptyLocal, null, validSnapshot, syncAccount, null, {});
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.nextState.challenges.length, 1);
  assert.equal(plan.nextState.challenges[0].name, "Cloud Challenge");
  assert.equal(plan.nextState.challenges[0].completedDays.length, 1);
  assert.equal(plan.nextState.challenges[0].note, "Cloud note");

  // Test 3-Way Conflict Detection when both Local and Cloud modify the challenge
  const conflictLocal = {
    version: 1,
    language: "en",
    challenges: [
      {
        id: "loc-conf-1",
        name: "Local Modified Title",
        durationDays: 30,
        startDate: "2026-10-01",
        completedDays: [1],
        createdAt: "2026-10-01T00:00:00.000Z",
        note: "Local Modified Note"
      }
    ]
  };

  const accountWithBaseline = {
    lastSyncedAt: "2026-10-02T00:00:00.000Z",
    challenges: {
      "loc-conf-1": {
        cloudId: "cloud-conf-1",
        migrationKey: "mig-1",
        baseline: {
          fields: { title: "Original Baseline Title", duration: 30, startDate: "2026-10-01" },
          challengeUpdatedAt: "2026-10-02T00:00:00.000Z",
          completionDates: ["2026-10-01"],
          noteHash: await syncNoteHash("Original Note"),
          noteUpdatedAt: "2026-10-02T00:00:00.000Z"
        },
        lastSyncedAt: "2026-10-02T00:00:00.000Z"
      }
    },
    preferencesBaseline: null,
    pending: {
      challengeChanges: { "loc-conf-1": "2026-10-03T01:00:00.000Z" },
      noteChanges: { "loc-conf-1": "2026-10-03T01:00:00.000Z" },
      challengeDeletes: {},
      completionAdds: {},
      completionDeletes: {},
      preferencesChangedAt: null
    }
  };

  const snapshotWithCloudEdit = {
    challenges: [
      {
        id: "cloud-conf-1",
        title: "Cloud Modified Title",
        description: null,
        duration: 30,
        startDate: "2026-10-01",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-03T02:00:00.000Z"
      }
    ],
    completions: [
      {
        challengeId: "cloud-conf-1",
        completionDate: "2026-10-01",
        updatedAt: "2026-10-01T00:00:00.000Z"
      }
    ],
    notes: [
      {
        challengeId: "cloud-conf-1",
        note: { content: "Cloud Modified Note", updatedAt: "2026-10-03T02:00:00.000Z" }
      }
    ],
    tombstones: [],
    preferences: { language: "en", updatedAt: null }
  };

  const conflictPlan = await analyseSync(conflictLocal, JSON.stringify(conflictLocal), snapshotWithCloudEdit, accountWithBaseline, null, {});
  assert.equal(conflictPlan.conflicts.length, 2, "Must detect 2 conflicts: challenge fields and note");
  assert.equal(conflictPlan.conflicts[0].kind, "challenge");
  assert.equal(conflictPlan.conflicts[1].kind, "note");

  // Conflict resolution: choose local for challenge, cloud for note
  const resolvedPlan = await analyseSync(conflictLocal, JSON.stringify(conflictLocal), snapshotWithCloudEdit, accountWithBaseline, null, {
    "challenge:loc-conf-1": "local",
    "note:loc-conf-1": "cloud"
  });
  assert.equal(resolvedPlan.conflicts.length, 0, "Resolved conflicts must have length 0");
  const resolvedItem = resolvedPlan.nextState.challenges[0];
  assert.equal(resolvedItem.name, "Local Modified Title");
  assert.equal(resolvedItem.note, "Cloud Modified Note");
});

test("8. Sync Mutation Tracking and applyingSyncState Lock", () => {
  localStorage.clear();
  const syncStore = {
    version: 1,
    accounts: {
      "user-1": {
        lastSyncedAt: "2026-10-01T00:00:00.000Z",
        challenges: {
          "c-1": {
            cloudId: "cloud-1",
            migrationKey: "mig-1",
            baseline: null,
            lastSyncedAt: "2026-10-01T00:00:00.000Z"
          }
        },
        preferencesBaseline: null,
        pending: {
          challengeChanges: {},
          noteChanges: {},
          challengeDeletes: {},
          completionAdds: {},
          completionDeletes: {},
          preferencesChangedAt: null
        }
      }
    }
  };
  saveSyncMetadata(syncStore);

  const prev = {
    version: 1,
    language: "en",
    challenges: [
      { id: "c-1", name: "Initial Name", durationDays: 30, startDate: "2026-10-01", completedDays: [1], createdAt: "2026-10-01T00:00:00.000Z" }
    ],
    reminders: { enabled: false }
  };
  const next = {
    version: 1,
    language: "en",
    challenges: [
      { id: "c-1", name: "Updated Name", durationDays: 30, startDate: "2026-10-01", completedDays: [1, 2], createdAt: "2026-10-01T00:00:00.000Z", note: "New note" }
    ],
    reminders: { enabled: false }
  };

  // Normal persist: should capture challengeChange, completionAdd, and noteChange
  captureSyncMutations(JSON.stringify(prev), JSON.stringify(next));

  const updatedStore = readSyncMetadata();
  const pending = updatedStore.accounts["user-1"].pending;
  assert.ok(pending.challengeChanges["c-1"], "Must capture challenge title update");
  assert.ok(pending.noteChanges["c-1"], "Must capture note creation");
  assert.ok(pending.completionAdds["c-1"]["2026-10-02"], "Must capture completed day 2");

  // When applyingSyncState is true, persist() MUST NOT capture mutations
  setApplyingSyncState(true);
  assert.equal(isApplyingSyncState(), true);
  // Clear pending
  pending.challengeChanges = {};
  saveSyncMetadata(updatedStore);

  const stateToPersist = { ...next, challenges: [{ ...next.challenges[0], name: "Cloud Applied Name" }] };
  persist(stateToPersist, JSON.stringify(next));

  const finalStore = readSyncMetadata();
  assert.deepEqual(finalStore.accounts["user-1"].pending.challengeChanges, {}, "Cloud applied updates must NOT be captured as local mutations");
  setApplyingSyncState(false);
});


test("7. Cloud Backup Source Reader", () => {
  localStorage.clear();
  const sampleLocal = {
    version: 1,
    language: "en",
    challenges: [
      {
        id: "loc-1",
        name: "Morning Run",
        durationDays: 30,
        startDate: "2026-10-01",
        completedDays: [1, 2],
        createdAt: "2026-10-01T00:00:00.000Z",
        note: "Great run"
      }
    ],
    reminders: "legacy-invalid"
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleLocal));

  const validated = readMigrationSource();
  assert.equal(validated.counts.challenges, 1);
  assert.equal(validated.counts.completions, 2);
  assert.equal(validated.counts.notes, 1);
  assert.equal(validated.source.challenges[0].name, "Morning Run");
});
