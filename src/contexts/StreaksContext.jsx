import React, { createContext, useState, useCallback, useRef } from "react";
import { load, persist, validImportChallenge, normalizeReminders, VERSION, STORAGE_KEY } from "../services/storage.js";
import { migrationUuid } from "../services/sync.js";
import { progress } from "../utils/streakCalculations.js";
import { validDate } from "../utils/date.js";

export const StreaksContext = createContext(null);

export function StreaksProvider({ children }) {
  // Lazy initialization directly from storage.load() ensures ZERO storage writes on mount
  const [state, setState] = useState(() => load());
  const stateRef = useRef(state);
  stateRef.current = state;

  const persistState = useCallback((nextState) => {
    const previousRaw = JSON.stringify(stateRef.current);
    const success = persist(nextState, previousRaw);
    if (success) {
      stateRef.current = nextState;
      setState(nextState);
    }
    return success;
  }, []);

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

    const success = persistState(nextState);
    if (!success) throw new Error("saveFailed");
    return newChallenge;
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
    if (!challenge) return { success: false };

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
    const saved = persistState(nextState);

    const is100 = progress(updatedChallenge) === 100;
    return {
      success: saved,
      challenge: updatedChallenge,
      wasComplete: was100,
      isComplete: is100,
      justCompleted: saved && !was100 && is100
    };
  }, [persistState]);

  const saveNote = useCallback((challengeId, noteText) => {
    const trimmed = String(noteText || "").trim();
    const challenge = stateRef.current.challenges.find((c) => c.id === challengeId);
    if (!challenge) return false;

    const updated = { ...challenge, note: trimmed };
    const nextChallenges = stateRef.current.challenges.map((c) =>
      c.id === challengeId ? updated : c
    );

    return persistState({ ...stateRef.current, challenges: nextChallenges });
  }, [persistState]);

  const deleteNote = useCallback((challengeId) => {
    const challenge = stateRef.current.challenges.find((c) => c.id === challengeId);
    if (!challenge) return false;

    const updated = { ...challenge };
    delete updated.note;

    const nextChallenges = stateRef.current.challenges.map((c) =>
      c.id === challengeId ? updated : c
    );

    return persistState({ ...stateRef.current, challenges: nextChallenges });
  }, [persistState]);

  const setLanguage = useCallback((lang) => {
    const normalized = lang === "ar" ? "ar" : "en";
    if (stateRef.current.language === normalized) return true;

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
    if (!saved) throw new Error("saveFailed");
    return true;
  }, [persistState]);

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
    stateRef.current = freshlyLoaded;
    setState(freshlyLoaded);
  }, []);

  const value = {
    challenges: state.challenges,
    language: state.language,
    reminders: state.reminders,
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
