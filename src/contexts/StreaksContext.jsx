import React, { createContext, useState, useCallback, useRef } from "react";
import { load, persist, replaceWithInitialState, validImportChallenge, normalizeReminders, VERSION } from "../services/storage.js";
import { migrationUuid } from "../services/sync.js";
import { progress } from "../utils/streakCalculations.js";
import { validDate } from "../utils/date.js";
import { useToast } from "../hooks/useToast.js";
import { t } from "../i18n/index.js";

export const StreaksContext = createContext(null);

export function StreaksProvider({ children }) {
  const [loadResult, setLoadResult] = useState(() => load());
  const state = loadResult.state;
  const stateRef = useRef(state);
  stateRef.current = state;
  const { showToast } = useToast();

  const persistState = useCallback((nextState) => {
    const previousRaw = JSON.stringify(stateRef.current);
    const result = persist(nextState, previousRaw);
    if (result.ok) {
      stateRef.current = nextState;
      setLoadResult((current) => ({
        ...current,
        ok: true,
        state: nextState,
        raw: JSON.stringify(nextState),
        error: null,
        quarantinedCount: 0
      }));
    } else {
      showToast(t("saveFailed", {}, stateRef.current.language), "danger");
    }
    return result;
  }, [showToast]);

  const createChallenge = useCallback(({ name, durationDays, startDate }) => {
    const trimmedName = String(name || "").trim();
    const duration = Number(durationDays);

    if (!trimmedName) {
      throw new Error("required");
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 365 || !validDate(startDate)) {
      throw new Error("invalidDate");
    }

    const newChallenge = {
      id: migrationUuid(),
      name: trimmedName,
      durationDays: duration,
      startDate,
      completedDays: [],
      createdAt: new Date().toISOString()
    };

    const nextState = {
      ...stateRef.current,
      challenges: [newChallenge, ...stateRef.current.challenges]
    };

    const result = persistState(nextState);
    return { ...result, challenge: result.ok ? newChallenge : null };
  }, [persistState]);

  const updateChallenge = useCallback((id, updates) => {
    const nextChallenges = stateRef.current.challenges.map((c) => {
      if (c.id !== id) return c;
      return { ...c, ...updates };
    });

    const nextState = { ...stateRef.current, challenges: nextChallenges };
    return persistState(nextState);
  }, [persistState]);

  const deleteChallenge = useCallback((id) => {
    const nextChallenges = stateRef.current.challenges.filter((c) => c.id !== id);
    const nextState = { ...stateRef.current, challenges: nextChallenges };
    return persistState(nextState);
  }, [persistState]);

  const toggleCompletion = useCallback((challengeId, dayNumber) => {
    const day = Number(dayNumber);
    const challenge = stateRef.current.challenges.find((c) => c.id === challengeId);
    if (!challenge) return { ok: false, error: new Error("challenge-not-found"), success: false };

    const was100 = progress(challenge) === 100;
    const exists = challenge.completedDays.includes(day);
    const nextCompleted = exists
      ? challenge.completedDays.filter((n) => n !== day)
      : [...challenge.completedDays, day].sort((a, b) => a - b);

    const updatedChallenge = { ...challenge, completedDays: nextCompleted };
    const nextChallenges = stateRef.current.challenges.map((c) =>
      c.id === challengeId ? updatedChallenge : c
    );

    const nextState = { ...stateRef.current, challenges: nextChallenges };
    const result = persistState(nextState);

    const is100 = progress(updatedChallenge) === 100;
    return {
      ...result,
      success: result.ok,
      challenge: result.ok ? updatedChallenge : challenge,
      wasComplete: was100,
      isComplete: is100,
      justCompleted: result.ok && !was100 && is100
    };
  }, [persistState]);

  const saveNote = useCallback((challengeId, noteText) => {
    const trimmed = String(noteText || "").trim();
    const challenge = stateRef.current.challenges.find((c) => c.id === challengeId);
    if (!challenge) return { ok: false, error: new Error("challenge-not-found") };

    const updated = { ...challenge, note: trimmed };
    const nextChallenges = stateRef.current.challenges.map((c) =>
      c.id === challengeId ? updated : c
    );

    return persistState({ ...stateRef.current, challenges: nextChallenges });
  }, [persistState]);

  const deleteNote = useCallback((challengeId) => {
    const challenge = stateRef.current.challenges.find((c) => c.id === challengeId);
    if (!challenge) return { ok: false, error: new Error("challenge-not-found") };

    const updated = { ...challenge };
    delete updated.note;

    const nextChallenges = stateRef.current.challenges.map((c) =>
      c.id === challengeId ? updated : c
    );

    return persistState({ ...stateRef.current, challenges: nextChallenges });
  }, [persistState]);

  const setLanguage = useCallback((lang) => {
    const normalized = lang === "ar" ? "ar" : "en";
    if (stateRef.current.language === normalized) return { ok: true, error: null };

    return persistState({
      ...stateRef.current,
      language: normalized
    });
  }, [persistState]);

  const setRemindersEnabled = useCallback((enabled) => {
    return persistState({
      ...stateRef.current,
      reminders: {
        ...stateRef.current.reminders,
        enabled: Boolean(enabled)
      }
    });
  }, [persistState]);

  const setLastReminderDate = useCallback((dateStr) => {
    return persistState({
      ...stateRef.current,
      reminders: {
        ...stateRef.current.reminders,
        lastReminderDate: dateStr
      }
    });
  }, [persistState]);

  const importData = useCallback((data) => {
    const ids = new Set();
    if (
      !data ||
      data.version !== VERSION ||
      !Array.isArray(data.challenges) ||
      !data.challenges.every((c) => {
        if (!validImportChallenge(c) || ids.has(c.id)) return false;
        ids.add(c.id);
        return true;
      }) ||
      (data.language !== "en" && data.language !== "ar")
    ) {
      throw new Error("importBad");
    }

    const nextState = {
      version: VERSION,
      language: data.language,
      challenges: data.challenges,
      reminders: normalizeReminders(stateRef.current.reminders)
    };

    const saved = persistState(nextState);
    if (!saved.ok) return saved;
    return true;
  }, [persistState]);

  const retryLoad = useCallback(() => {
    const result = load();
    stateRef.current = result.state;
    setLoadResult(result);
    return result;
  }, []);

  const startFresh = useCallback(() => {
    if (!loadResult.raw || loadResult.error?.code === "storage-unavailable") {
      return { ok: false, error: new Error("Raw data is unavailable for safe recovery") };
    }
    const result = replaceWithInitialState(loadResult.raw);
    if (!result.ok) {
      showToast(t("saveFailed", {}, stateRef.current.language), "danger");
      return result;
    }
    const fresh = load();
    stateRef.current = fresh.state;
    setLoadResult(fresh);
    return result;
  }, [loadResult, showToast]);

  const exportData = useCallback(() => {
    const raw = JSON.stringify(stateRef.current, null, 2);
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "streaks-data.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, []);

  const reloadFromStorage = useCallback(() => {
    const freshlyLoaded = load();
    stateRef.current = freshlyLoaded.state;
    setLoadResult(freshlyLoaded);
  }, []);

  const value = {
    challenges: state.challenges,
    language: state.language,
    reminders: state.reminders,
    loadError: loadResult.ok ? null : loadResult.error,
    rawStorageData: loadResult.raw,
    quarantinedCount: loadResult.quarantinedCount,
    retryLoad,
    startFresh,
    createChallenge,
    updateChallenge,
    deleteChallenge,
    toggleCompletion,
    saveNote,
    deleteNote,
    setLanguage,
    setRemindersEnabled,
    setLastReminderDate,
    importData,
    exportData,
    reloadFromStorage
  };

  return <StreaksContext.Provider value={value}>{children}</StreaksContext.Provider>;
}
