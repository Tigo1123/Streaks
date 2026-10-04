import { debounceTask } from "./localMutationEvents.js";

export const SYNC_DEBOUNCE_MS = 7000;
export const SYNC_FOCUS_MIN_INTERVAL_MS = 60000;
export const SYNC_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;

export function classifyInitialSync({ localCount, cloudCount, alreadyHandled = false }) {
  if (alreadyHandled) return "sync";
  if (localCount > 0 && cloudCount === 0) return "choose";
  if (localCount > 0 && cloudCount > 0) return "merge";
  if (localCount === 0 && cloudCount > 0) return "download";
  return "sync";
}

export function markLocalChallengesOnly(account, local, snapshot) {
  account.initialSyncHandled = "empty";
  account.localOnlyIds = local.source.challenges.map((challenge) => challenge.id);
  account.preferencesBaseline = {
    value: {
      language: local.source.language,
      remindersEnabled: local.source.reminders?.enabled === true
    },
    updatedAt: snapshot.preferences.updatedAt
  };
  account.pending.preferencesChangedAt = null;
  return account;
}

export async function withSyncLock(userId, operation, lockManager = globalThis.navigator?.locks) {
  if (!lockManager?.request) return operation();
  return lockManager.request(`streaks-cloud-sync-${userId}`, { mode: "exclusive" }, operation);
}

export async function retryAfterAuthRefresh(operation, restoreSession, readSession, previousToken) {
  try {
    return await operation(previousToken);
  } catch (error) {
    if (error?.status !== 401) throw error;
    await restoreSession();
    const refreshedSession = readSession();
    if (!refreshedSession?.token || refreshedSession.token === previousToken) throw error;
    return operation(refreshedSession.token);
  }
}

export function createSyncTriggers({
  startSync,
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  subscribeMutations,
  debounceMs = SYNC_DEBOUNCE_MS,
  minimumFocusIntervalMs = SYNC_FOCUS_MIN_INTERVAL_MS,
  now = Date.now
}) {
  let lastFocusSyncAt = -Infinity;
  const debouncedMutation = debounceTask(() => startSync("mutation"), debounceMs);
  const onFocus = () => {
    const visible = documentObject?.visibilityState === undefined ||
      documentObject.visibilityState === "visible";
    if (!visible || now() - lastFocusSyncAt < minimumFocusIntervalMs) return;
    lastFocusSyncAt = now();
    startSync("focus");
  };
  const onOnline = () => startSync("online");

  const unsubscribeMutations = subscribeMutations?.(() => debouncedMutation.schedule());
  windowObject?.addEventListener("focus", onFocus);
  documentObject?.addEventListener("visibilitychange", onFocus);
  windowObject?.addEventListener("online", onOnline);

  return () => {
    debouncedMutation.cancel();
    unsubscribeMutations?.();
    windowObject?.removeEventListener("focus", onFocus);
    documentObject?.removeEventListener("visibilitychange", onFocus);
    windowObject?.removeEventListener("online", onOnline);
  };
}
