import React, { createContext, useState, useCallback, useRef, useEffect } from "react";
import { runCloudSync, syncErrorKey, readSyncMetadata } from "../services/sync.js";
import { readMigrationSource, migrationStore } from "../services/cloudBackup.js";
import { useAuth } from "../hooks/useAuth.js";
import { useStreaks } from "../hooks/useStreaks.js";
import { useTimezone } from "../hooks/useTimezone.js";

export const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const { token, user, isAuthenticated, logout } = useAuth();
  const { reloadFromStorage } = useStreaks();
  const { today, ensureServerTimezone, refreshServerTime, acceptServerTime, adoptServerTimezone } = useTimezone();

  const [status, setStatus] = useState("idle"); // "idle" | "syncing" | "conflict" | "success" | "error" | "offline"
  const [isRunning, setIsRunning] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [decisions, setDecisions] = useState({});
  const [resultKey, setResultKey] = useState(null);
  const [resultCounts, setResultCounts] = useState(null);
  const [errorKey, setErrorKey] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const abortControllerRef = useRef(null);

  // Load lastSyncedAt for active user on auth state change
  useEffect(() => {
    if (user?.id) {
      try {
        const store = readSyncMetadata();
        const account = store.accounts[user.id];
        setLastSyncedAt(account?.lastSyncedAt || null);
      } catch (_) {
        setLastSyncedAt(null);
      }
    } else {
      setLastSyncedAt(null);
    }
  }, [user?.id]);

  const startSync = useCallback(async (customDecisions = decisions) => {
    if (isRunning) return;
    if (!isAuthenticated || !token || !user?.id) {
      setStatus("error");
      setErrorKey("syncSession");
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      setErrorKey("syncOffline");
      return;
    }

    setIsRunning(true);
    setStatus("syncing");
    setErrorKey(null);
    setResultKey(null);
    setResultCounts(null);

    abortControllerRef.current = new AbortController();

    try {
      await ensureServerTimezone();
      await refreshServerTime();
      const outcome = await runCloudSync({
        token,
        userId: user.id,
        decisions: customDecisions,
        signal: abortControllerRef.current.signal,
        readMigrationSourceFn: () => readMigrationSource(today),
        migrationStoreFn: migrationStore
      });

      if (outcome.status === "conflict") {
        adoptServerTimezone(outcome.timezone, outcome.time);
        setConflicts(outcome.conflicts);
        setConflictIndex(0);
        setStatus("conflict");
        setIsRunning(false);
        return;
      }

      // Success: reload fresh state into StreaksContext
      reloadFromStorage();
      setLastSyncedAt(outcome.lastSyncedAt);
      adoptServerTimezone(outcome.timezone, outcome.time);
      acceptServerTime(outcome.time);
      setResultKey("syncComplete");
      setResultCounts(outcome.counts);
      setStatus("success");
      setConflicts([]);
      setDecisions({});
    } catch (err) {
      const key = syncErrorKey(err);
      setErrorKey(key);
      setStatus(key === "syncOffline" ? "offline" : "error");

      if (err?.status === 401) {
        logout();
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [isRunning, isAuthenticated, token, user?.id, decisions, reloadFromStorage, logout, ensureServerTimezone, refreshServerTime, acceptServerTime, adoptServerTimezone, today]);

  const resolveConflict = useCallback((key, side) => {
    if (!["local", "cloud"].includes(side)) return;

    const nextDecisions = { ...decisions, [key]: side };
    setDecisions(nextDecisions);

    if (conflictIndex + 1 < conflicts.length) {
      setConflictIndex((prev) => prev + 1);
    } else {
      // All conflicts resolved, restart sync with full decision map
      startSync(nextDecisions);
    }
  }, [decisions, conflictIndex, conflicts.length, startSync]);

  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setStatus("idle");
    setConflicts([]);
    setDecisions({});
  }, []);

  const resetSyncState = useCallback(() => {
    setStatus("idle");
    setResultKey(null);
    setResultCounts(null);
    setErrorKey(null);
    setConflicts([]);
    setDecisions({});
  }, []);

  const value = {
    status,
    isRunning,
    lastSyncedAt,
    conflicts,
    currentConflict: conflicts[conflictIndex] || null,
    conflictIndex,
    totalConflicts: conflicts.length,
    resultKey,
    resultCounts,
    errorKey,
    startSync,
    resolveConflict,
    cancelSync,
    resetSyncState
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
