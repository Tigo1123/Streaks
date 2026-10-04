import React, { createContext, useState, useCallback, useRef, useEffect } from "react";
import { load, mutateState, replaceWithInitialState, validImportChallenge, normalizeReminders, VERSION } from "../services/storage.js";
import { migrationUuid } from "../services/sync.js";
import { progress } from "../utils/streakCalculations.js";
import { validDate } from "../utils/date.js";
import { useToast } from "../hooks/useToast.js";
import { t } from "../i18n/index.js";
import { handleStorageEvent } from "../services/storageEvents.js";

export const StreaksContext = createContext(null);

export function StreaksProvider({ children }) {
  const [loadResult, setLoadResult] = useState(() => load());
  const state = loadResult.state;
  const stateRef = useRef(state);
  stateRef.current = state;
  const { showToast } = useToast();

  const updateFromStorage = useCallback((result) => {
    stateRef.current = result.state;
    setLoadResult(result);
  }, []);

  const runMutation = useCallback(async (updater) => {
    const result = await mutateState(updater);
    if (result.ok) {
      updateFromStorage({
        ok: true,
        state: result.state,
        raw: result.raw,
        error: null,
        quarantinedCount: result.quarantinedCount || 0
      });
    } else if (result.loadResult) {
      updateFromStorage(result.loadResult);
    } else {
      if (result.state && result.raw !== undefined) {
        updateFromStorage({
          ok: true,
          state: result.state,
          raw: result.raw,
          error: null,
          quarantinedCount: 0
        });
      }
      showToast(t("saveFailed", {}, stateRef.current.language), "danger");
    }
    return result;
  }, [showToast, updateFromStorage]);

  useEffect(() => {
    const handleStorage = (event) => {
      handleStorageEvent(event, loadResult.raw, stateRef.current, updateFromStorage);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [loadResult.raw, updateFromStorage]);

  const createChallenge = useCallback(async ({ name, durationDays, startDate }) => {
    const trimmedName = String(name || "").trim();
    const duration = Number(durationDays);

    if (!trimmedName) throw new Error("required");
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

    const result = await runMutation((current) => ({
      state: { ...current, challenges: [newChallenge, ...current.challenges] },
      value: newChallenge
    }));
    return { ...result, challenge: result.ok ? result.value : null };
  }, [runMutation]);

  const updateChallenge = useCallback((id, updates) => runMutation((current) => ({
    state: {
      ...current,
      challenges: current.challenges.map((challenge) =>
        challenge.id === id ? { ...challenge, ...updates } : challenge
      )
    }
  })), [runMutation]);

  const deleteChallenge = useCallback((id) => runMutation((current) => ({
    state: { ...current, challenges: current.challenges.filter((challenge) => challenge.id !== id) }
  })), [runMutation]);

  const toggleCompletion = useCallback((challengeId, dayNumber) => {
    const day = Number(dayNumber);
    return runMutation((current) => {
      const challenge = current.challenges.find((item) => item.id === challengeId);
      if (!challenge) return { ok: false, error: new Error("challenge-not-found") };

      const wasComplete = progress(challenge) === 100;
      const completedDays = challenge.completedDays.includes(day)
        ? challenge.completedDays.filter((item) => item !== day)
        : [...challenge.completedDays, day].sort((a, b) => a - b);
      const updatedChallenge = { ...challenge, completedDays };
      const nextState = {
        ...current,
        challenges: current.challenges.map((item) => item.id === challengeId ? updatedChallenge : item)
      };
      return {
        state: nextState,
        value: {
          challenge: updatedChallenge,
          wasComplete,
          isComplete: progress(updatedChallenge) === 100
        }
      };
    }).then((result) => ({
      ...result,
      success: result.ok,
      challenge: result.ok ? result.value.challenge : null,
      wasComplete: result.ok ? result.value.wasComplete : false,
      isComplete: result.ok ? result.value.isComplete : false,
      justCompleted: result.ok && !result.value.wasComplete && result.value.isComplete
    }));
  }, [runMutation]);

  const saveNote = useCallback((challengeId, noteText) => {
    const trimmed = String(noteText || "").trim();
    return runMutation((current) => {
      if (!current.challenges.some((challenge) => challenge.id === challengeId)) {
        return { ok: false, error: new Error("challenge-not-found") };
      }
      return {
        state: {
          ...current,
          challenges: current.challenges.map((challenge) =>
            challenge.id === challengeId ? { ...challenge, note: trimmed } : challenge
          )
        }
      };
    });
  }, [runMutation]);

  const deleteNote = useCallback((challengeId) => {
    return runMutation((current) => {
      if (!current.challenges.some((challenge) => challenge.id === challengeId)) {
        return { ok: false, error: new Error("challenge-not-found") };
      }
      return {
        state: {
          ...current,
          challenges: current.challenges.map((challenge) => {
            if (challenge.id !== challengeId) return challenge;
            const updated = { ...challenge };
            delete updated.note;
            return updated;
          })
        }
      };
    });
  }, [runMutation]);

  const setLanguage = useCallback((lang) => {
    const normalized = lang === "ar" ? "ar" : "en";
    return runMutation((current) => ({ state: { ...current, language: normalized } }));
  }, [runMutation]);

  const setRemindersEnabled = useCallback((enabled) => {
    return runMutation((current) => ({
      state: { ...current, reminders: { ...current.reminders, enabled: Boolean(enabled) } }
    }));
  }, [runMutation]);

  const setLastReminderDate = useCallback((dateStr) => {
    return runMutation((current) => ({
      state: { ...current, reminders: { ...current.reminders, lastReminderDate: dateStr } }
    }));
  }, [runMutation]);

  const importData = useCallback(async (data) => {
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

    const saved = await runMutation((current) => ({
      state: {
        version: VERSION,
        language: data.language,
        challenges: data.challenges,
        reminders: normalizeReminders(current.reminders)
      }
    }));
    if (!saved.ok) return saved;
    return true;
  }, [runMutation]);

  const retryLoad = useCallback(() => {
    const result = load();
    stateRef.current = result.state;
    setLoadResult(result);
    return result;
  }, []);

  const startFresh = useCallback(async () => {
    if (!loadResult.raw || loadResult.error?.code === "storage-unavailable") {
      return { ok: false, error: new Error("Raw data is unavailable for safe recovery") };
    }
    const result = await replaceWithInitialState(loadResult.raw);
    if (!result.ok) {
      showToast(t("saveFailed", {}, stateRef.current.language), "danger");
      return result;
    }
    const fresh = load();
    updateFromStorage(fresh);
    return result;
  }, [loadResult, showToast, updateFromStorage]);

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
    updateFromStorage(freshlyLoaded);
  }, [updateFromStorage]);

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
