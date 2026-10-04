import React, { createContext, useState, useCallback, useRef, useEffect } from "react";
import {
  runCloudSync,
  syncErrorKey,
  readSyncMetadata,
  ensureSyncAccount,
  saveSyncMetadata
} from "../services/sync.js";
import { readMigrationSource, migrationStore } from "../services/cloudBackup.js";
import { saveRawBackup, STORAGE_KEY } from "../services/storage.js";
import { subscribeLocalMutations } from "../services/localMutationEvents.js";
import {
  createSyncTriggers,
  classifyInitialSync,
  markLocalChallengesOnly,
  withSyncLock,
  retryAfterAuthRefresh,
  SYNC_RETRY_MAX_DELAY_MS
} from "../services/syncAutomation.js";
import { readAuthSession } from "../services/authStorage.js";
import { useAuth } from "../hooks/useAuth.js";
import { useStreaks } from "../hooks/useStreaks.js";
import { useTimezone } from "../hooks/useTimezone.js";

export const SyncContext = createContext(null);
const retryBaseDelayMs = 5000;

export function SyncProvider({ children }) {
  const { token, user, isAuthenticated, restoreSession } = useAuth();
  const { reloadFromStorage } = useStreaks();
  const { today, acceptServerTime, adoptServerTimezone } = useTimezone();

  const [status, setStatus] = useState("idle");
  const [isRunning, setIsRunning] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [decisions, setDecisions] = useState({});
  const [resultKey, setResultKey] = useState(null);
  const [resultCounts, setResultCounts] = useState(null);
  const [errorKey, setErrorKey] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [firstSyncPrompt, setFirstSyncPrompt] = useState(null);
  const [initialMergeNotice, setInitialMergeNotice] = useState(null);

  const abortControllerRef = useRef(null);
  const runningPromiseRef = useRef(null);
  const rerunRequestedRef = useRef(false);
  const loginSyncUserRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef(null);
  const startSyncRef = useRef(null);
  const firstSyncPromptRef = useRef(null);
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;

  const scheduleRetry = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    const delay = Math.min(retryBaseDelayMs * (2 ** retryAttemptRef.current), SYNC_RETRY_MAX_DELAY_MS);
    retryAttemptRef.current++;
    retryTimerRef.current = setTimeout(() => {
      if (isAuthenticated) startSyncRef.current?.("retry");
    }, delay);
  }, [isAuthenticated]);

  const startSync = useCallback((customDecisions = decisions, options = {}) => {
    const {
      trigger = "manual",
      firstSyncChoice = null,
      allowAuthRetry = true
    } = options;

    if (!isAuthenticated || !token || !user?.id) return Promise.resolve({ skipped: true });
    if (firstSyncPromptRef.current && !firstSyncChoice && trigger !== "manual") {
      return Promise.resolve({ choiceRequired: true });
    }
    if (runningPromiseRef.current) {
      if (trigger === "mutation") rerunRequestedRef.current = true;
      return runningPromiseRef.current;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      setErrorKey("syncOffline");
      return Promise.resolve({ offline: true });
    }

    const operation = withSyncLock(user.id, async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        setErrorKey("syncOffline");
        return { offline: true };
      }

      if (trigger === "focus") {
        try {
          const store = readSyncMetadata();
          const account = store.accounts[user.id];
          const lastFocusSyncAt = Date.parse(account?.lastFocusSyncAt || 0);
          if (Number.isFinite(lastFocusSyncAt) && Date.now() - lastFocusSyncAt < 60000) {
            return { throttled: true };
          }
          const nextAccount = ensureSyncAccount(store, user.id);
          nextAccount.lastFocusSyncAt = new Date().toISOString();
          if (!saveSyncMetadata(store)) throw new Error("syncStorage");
        } catch (error) {
          setStatus("error");
          setErrorKey(syncErrorKey(error));
          return { error };
        }
      }

      setIsRunning(true);
      setStatus("syncing");
      setErrorKey(null);
      setResultKey(null);
      setResultCounts(null);
      abortControllerRef.current = new AbortController();

      const execute = async (accessToken) => {
        return runCloudSync({
          token: accessToken,
          userId: user.id,
          decisions: customDecisions,
          signal: abortControllerRef.current.signal,
          readMigrationSourceFn: () => readMigrationSource(today),
          migrationStoreFn: migrationStore,
          beforeAnalyse: async ({ local, snapshot, account, store, isFirstOnDevice }) => {
            const direction = classifyInitialSync({
              localCount: local.source.challenges.length,
              cloudCount: snapshot.challenges.length,
              alreadyHandled: Boolean(account.initialSyncHandled)
            });

            if (isFirstOnDevice && direction === "choose" && !firstSyncChoice) {
              const prompt = {
                localCount: local.source.challenges.length,
                cloudCount: snapshot.challenges.length
              };
              firstSyncPromptRef.current = prompt;
              setFirstSyncPrompt(prompt);
              return { status: "choice-required" };
            }

            if (isFirstOnDevice && (direction === "merge" || direction === "choose")) {
              if (local.raw !== null) {
                const backup = saveRawBackup(local.raw);
                if (!backup.ok) throw new Error("syncBackupFailed");
              }

              if (direction === "merge") {
                account.initialSyncHandled = "merge";
                setInitialMergeNotice({
                  localCount: local.source.challenges.length,
                  cloudCount: snapshot.challenges.length
                });
              } else if (firstSyncChoice === "empty") {
                markLocalChallengesOnly(account, local, snapshot);
              } else {
                account.initialSyncHandled = "upload";
              }

              if (!saveSyncMetadata(store)) throw new Error("syncStorage");
            }
            return null;
          }
        });
      };

      try {
        const outcome = allowAuthRetry
          ? await retryAfterAuthRefresh(execute, restoreSession, readAuthSession, token)
          : await execute(token);

        if (outcome.status === "choice-required") {
          setStatus("choice");
          return outcome;
        }

        if (outcome.status === "conflict") {
          adoptServerTimezone(outcome.timezone, outcome.time);
          setConflicts(outcome.conflicts);
          setConflictIndex(0);
          setStatus("conflict");
          return outcome;
        }

        reloadFromStorage();
        setLastSyncedAt(outcome.lastSyncedAt);
        adoptServerTimezone(outcome.timezone, outcome.time);
        acceptServerTime(outcome.time);
        setResultKey("syncComplete");
        setResultCounts(outcome.counts);
        setStatus("success");
        setConflicts([]);
        setDecisions({});
        firstSyncPromptRef.current = null;
        setFirstSyncPrompt(null);
        retryAttemptRef.current = 0;
        clearTimeout(retryTimerRef.current);
        return outcome;
      } catch (error) {
        const key = syncErrorKey(error);
        setErrorKey(error?.message === "syncBackupFailed" ? "syncBackupFailed" : key);
        setStatus(key === "syncOffline" || error?.status >= 500 || error instanceof TypeError ? "offline" : "error");

        if (error?.status === 401) await restoreSession();
        if (
          key === "syncOffline" ||
          error?.status >= 500 ||
          error instanceof TypeError ||
          error?.name === "AbortError" ||
          error?.name === "TimeoutError"
        ) scheduleRetry();
        return { error };
      } finally {
        setIsRunning(false);
        abortControllerRef.current = null;
      }
    }).then((outcome) => {
      runningPromiseRef.current = null;
      if (
        rerunRequestedRef.current &&
        outcome?.status !== "conflict" &&
        outcome?.status !== "choice-required"
      ) {
        rerunRequestedRef.current = false;
        setTimeout(() => startSyncRef.current?.("mutation"), 0);
      }
      return outcome;
    }, (error) => {
      runningPromiseRef.current = null;
      throw error;
    });

    runningPromiseRef.current = operation;
    return operation;
  }, [
    decisions,
    isAuthenticated,
    token,
    user?.id,
    today,
    restoreSession,
    adoptServerTimezone,
    reloadFromStorage,
    acceptServerTime,
    scheduleRetry
  ]);

  startSyncRef.current = (trigger = "manual") => startSync(decisionsRef.current, { trigger });

  const chooseInitialSync = useCallback((choice) => {
    if (!["upload", "empty"].includes(choice)) return Promise.resolve({ skipped: true });
    firstSyncPromptRef.current = null;
    setFirstSyncPrompt(null);
    return startSync(decisions, { trigger: "manual", firstSyncChoice: choice });
  }, [startSync, decisions]);

  const resolveConflict = useCallback((key, side) => {
    if (!["local", "cloud"].includes(side)) return;

    const nextDecisions = { ...decisions, [key]: side };
    setDecisions(nextDecisions);

    if (conflictIndex + 1 < conflicts.length) {
      setConflictIndex((prev) => prev + 1);
    } else {
      startSync(nextDecisions, { trigger: "manual" });
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

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      loginSyncUserRef.current = null;
      return undefined;
    }

    const runForTrigger = (trigger) => {
      startSyncRef.current?.(trigger);
    };
    const removeTriggers = createSyncTriggers({
      startSync: runForTrigger,
      subscribeMutations: subscribeLocalMutations
    });

    if (loginSyncUserRef.current !== user.id) {
      loginSyncUserRef.current = user.id;
      runForTrigger("login");
    }
    return removeTriggers;
  }, [isAuthenticated, user?.id]);

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

  useEffect(() => () => clearTimeout(retryTimerRef.current), []);

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
    firstSyncPrompt,
    initialMergeNotice,
    startSync,
    chooseInitialSync,
    resolveConflict,
    cancelSync,
    resetSyncState
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
