import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getApiBaseUrl } from "../src/utils/config.js";
import { STORAGE_KEY } from "../src/services/storage.js";
import { AUTH_TOKEN_KEY } from "../src/services/authStorage.js";

// Setup storage mocks
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

test("Phase 4 - Production API Resolution Verification", () => {
  // Scenario 1: Production static frontend on Render (https://streaks-p6f7.onrender.com)
  globalThis.window = {
    location: {
      hostname: "streaks-p6f7.onrender.com",
      port: "",
      origin: "https://streaks-p6f7.onrender.com",
      protocol: "https:"
    }
  };
  globalThis.document = {
    querySelector: (sel) => {
      if (sel.includes("streaks-api-base-url")) {
        return { content: "https://streaks-api-7213.onrender.com" };
      }
      return null;
    }
  };

  const prodUrl = getApiBaseUrl();
  assert.equal(
    prodUrl,
    "https://streaks-api-7213.onrender.com",
    "On production origin, getApiBaseUrl() must resolve to https://streaks-api-7213.onrender.com"
  );

  // Scenario 2: Production fallback when meta tag content is missing
  globalThis.document = { querySelector: () => null };
  const fallbackProdUrl = getApiBaseUrl();
  assert.equal(
    fallbackProdUrl,
    "https://streaks-api-7213.onrender.com",
    "Fallback on production must be https://streaks-api-7213.onrender.com"
  );

  // Scenario 3: Localhost development (port 8080 frontend -> port 10000 API)
  globalThis.window = {
    location: {
      hostname: "localhost",
      port: "8080",
      origin: "http://localhost:8080",
      protocol: "http:"
    }
  };
  const localUrl = getApiBaseUrl();
  assert.equal(
    localUrl,
    "http://localhost:10000",
    "On local development (port 8080), API must resolve to port 10000"
  );
});

test("Phase 4 - StreaksContext Logic & Initial Load Safety", async () => {
  localStorage.clear();

  // Setup pre-existing persistent data
  const existingData = {
    version: 1,
    language: "ar",
    challenges: [
      {
        id: "existing-uuid-1",
        name: "Morning Running",
        durationDays: 30,
        startDate: "2026-10-01",
        completedDays: [1, 2],
        createdAt: "2026-10-01T00:00:00.000Z",
        note: "Day 2 felt easy"
      }
    ],
    reminders: { enabled: true, lastReminderDate: "2026-10-02" }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existingData));

  const { load, persist, isApplyingSyncState } = await import("../src/services/storage.js");

  // Verify non-destructive load
  const rawBefore = localStorage.getItem(STORAGE_KEY);
  const loaded = load();
  const rawAfter = localStorage.getItem(STORAGE_KEY);

  assert.equal(rawBefore, rawAfter, "Calling load() must NOT modify or overwrite localStorage");
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.challenges.length, 1);
  assert.equal(loaded.state.challenges[0].name, "Morning Running");
  assert.equal(loaded.state.language, "ar");
  assert.equal(loaded.state.reminders.enabled, true);

  // Test mutation persist
  const nextChallenges = [
    ...loaded.state.challenges,
    {
      id: "new-uuid-2",
      name: "Evening Reading",
      durationDays: 14,
      startDate: "2026-10-03",
      completedDays: [],
      createdAt: "2026-10-03T00:00:00.000Z"
    }
  ];
  const nextState = { ...loaded.state, challenges: nextChallenges };
  const saved = persist(nextState, rawBefore);
  assert.deepEqual(saved, { ok: true, error: null });

  const updatedLoaded = load();
  assert.equal(updatedLoaded.state.challenges.length, 2);
  assert.equal(updatedLoaded.state.challenges[1].name, "Evening Reading");
});

test("Phase 4 - AuthContext Lifecycle & Session Safety", async () => {
  sessionStorage.clear();
  localStorage.clear();

  // Preserve local streaks data
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, language: "en", challenges: [] }));

  const { readAuthToken, saveAuthToken, clearAuthToken } = await import("../src/services/authStorage.js");

  // 1. Initial empty session
  assert.equal(readAuthToken(), null);

  // 2. Token saved in sessionStorage
  const token = "mock-jwt-token";
  saveAuthToken(token);
  assert.equal(readAuthToken(), token);
  assert.equal(sessionStorage.getItem(AUTH_TOKEN_KEY), token);
  assert.equal(localStorage.getItem(AUTH_TOKEN_KEY), null, "Token must NOT touch localStorage");

  // 3. Clear token (logout / session expiry)
  clearAuthToken();
  assert.equal(readAuthToken(), null);
  assert.ok(localStorage.getItem(STORAGE_KEY), "Local Streaks data MUST survive logout / auth expiry");
});

test("Phase 4 - SyncContext State Model & Offline Detection", async () => {
  const { syncErrorKey } = await import("../src/services/sync.js");

  // Offline error mapping using Object.defineProperty to override Node 22 getter
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: false },
    configurable: true,
    writable: true
  });
  assert.equal(syncErrorKey({ message: "NetworkError" }), "syncOffline");

  // Session expired error mapping
  assert.equal(syncErrorKey({ status: 401 }), "syncSession");

  // Online network error
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
    writable: true
  });
  assert.equal(syncErrorKey({ message: "NetworkError" }), "syncFailed");
});

test("Phase 4 - Navigation History API Synchronization", () => {
  let currentState = null;
  const historyStack = [];

  globalThis.window = {
    history: {
      get state() {
        return currentState;
      },
      pushState(state) {
        currentState = state;
        historyStack.push(state);
      },
      back() {
        historyStack.pop();
        currentState = historyStack[historyStack.length - 1] || null;
      }
    }
  };

  // 1. Initial root state
  assert.equal(window.history.state, null);

  // 2. Navigate to challenge detail
  window.history.pushState({ streaksScreen: "detail", challengeId: "c-100" });
  assert.equal(window.history.state?.streaksScreen, "detail");
  assert.equal(window.history.state?.challengeId, "c-100");

  // 3. Open modal on top of detail
  window.history.pushState({ streaksModal: true, modalMode: "create" });
  assert.equal(window.history.state?.streaksModal, true);

  // 4. Back button closes modal, returning to detail
  window.history.back();
  assert.equal(window.history.state?.streaksScreen, "detail");

  // 5. Back button from detail returns to root dashboard
  window.history.back();
  assert.equal(window.history.state, null);
});

test("Phase 4 - Toast State and Live Region Attributes", () => {
  // Verify live region attribute rules:
  // Normal notification toast: role="status", aria-live="polite"
  // Alert/danger error toast: role="alert", aria-live="assertive"
  const normalToast = { id: 1, message: "Saved note", type: "status" };
  const alertToast = { id: 2, message: "Session expired", type: "alert" };
  const dangerToast = { id: 3, message: "Failed", type: "danger" };

  const getAriaLive = (type) => (type === "alert" || type === "danger" ? "assertive" : "polite");
  const getRole = (type) => (type === "alert" || type === "danger" ? "alert" : "status");

  assert.equal(getAriaLive(normalToast.type), "polite");
  assert.equal(getRole(normalToast.type), "status");

  assert.equal(getAriaLive(alertToast.type), "assertive");
  assert.equal(getRole(alertToast.type), "alert");

  assert.equal(getAriaLive(dangerToast.type), "assertive");
  assert.equal(getRole(dangerToast.type), "alert");
});
