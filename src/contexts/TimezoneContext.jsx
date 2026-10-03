import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authRequest } from "../services/api.js";
import { detectedTimezone, isValidTimezone, localToday } from "../utils/date.js";
import { useAuth } from "../hooks/useAuth.js";
import { useStreaks } from "../hooks/useStreaks.js";
import { useToast } from "../hooks/useToast.js";
import { useToday } from "../hooks/useToday.js";
import { t } from "../i18n/index.js";

const LOCAL_TIMEZONE_KEY = "streaks-timezone-v1";
const IGNORED_MISMATCH_KEY = "streaks-timezone-ignored-v1";
const MIN_SERVER_REFRESH_MS = 60_000;

export const TimezoneContext = createContext(null);

function readLocalTimezone() {
  try {
    const saved = localStorage.getItem(LOCAL_TIMEZONE_KEY);
    return isValidTimezone(saved) ? saved : detectedTimezone();
  } catch {
    return detectedTimezone();
  }
}

function writeLocalTimezone(timezone) {
  localStorage.setItem(LOCAL_TIMEZONE_KEY, timezone);
}

function mismatchKey(serverTimezone, browserTimezone) {
  return `${serverTimezone}|${browserTimezone}`;
}

export function TimezoneProvider({ children }) {
  const { token, user, isAuthenticated, updateUserTimezone, time: authTime } = useAuth();
  const { language } = useStreaks();
  const { showToast } = useToast();
  const browserTimezone = detectedTimezone();
  const [timezone, setTimezoneState] = useState(readLocalTimezone);
  const [serverTime, setServerTime] = useState(authTime || null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const lastServerRefreshAt = useRef(0);
  const serverTimeRef = useRef(serverTime);
  serverTimeRef.current = serverTime;
  const shownMismatchRef = useRef(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      setTimezoneState(readLocalTimezone());
      setServerTime(null);
      lastServerRefreshAt.current = 0;
      return;
    }
    if (isValidTimezone(user?.timezone)) {
      setTimezoneState(user.timezone);
    }
    if (authTime) {
      const receivedTime = { ...authTime, receivedAtMonotonic: performance.now() };
      setServerTime(receivedTime);
      serverTimeRef.current = receivedTime;
      lastServerRefreshAt.current = performance.now();
    }
  }, [isAuthenticated, user?.id, user?.timezone, authTime]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const acceptServerTime = useCallback((nextTime) => {
    if (!nextTime || typeof nextTime.today !== "string" ||
        !Number.isFinite(Date.parse(nextTime.serverNow)) ||
        !Number.isFinite(Date.parse(nextTime.nextMidnightAt))) return;
    const receivedTime = { ...nextTime, receivedAtMonotonic: performance.now() };
    setServerTime(receivedTime);
    serverTimeRef.current = receivedTime;
    lastServerRefreshAt.current = performance.now();
  }, []);

  const adoptServerTimezone = useCallback((serverTimezone, nextTime) => {
    if (!isValidTimezone(serverTimezone)) return;
    setTimezoneState(serverTimezone);
    updateUserTimezone(serverTimezone, nextTime);
    if (nextTime) acceptServerTime(nextTime);
  }, [updateUserTimezone, acceptServerTime]);

  const ensureServerTimezone = useCallback(async () => {
    if (!isAuthenticated || !token) return null;
    if (isValidTimezone(user?.timezone)) {
      setTimezoneState(user.timezone);
      return user.timezone;
    }

    const { response, payload } = await authRequest("/api/preferences", {
      method: "PATCH",
      token,
      body: { timezone: browserTimezone }
    });
    if (!response.ok || !isValidTimezone(payload?.preferences?.timezone)) {
      throw new Error("timezoneSaveFailed");
    }
    updateUserTimezone(payload.preferences.timezone, payload.time);
    setTimezoneState(payload.preferences.timezone);
    acceptServerTime(payload.time);
    return payload.preferences.timezone;
  }, [isAuthenticated, token, user?.timezone, browserTimezone, updateUserTimezone, acceptServerTime]);

  const refreshServerTime = useCallback(async () => {
    if (!isAuthenticated || !token || !isOnline) {
      setServerTime(null);
      serverTimeRef.current = null;
      return null;
    }

    const now = performance.now();
    const elapsed = now - lastServerRefreshAt.current;
    if (lastServerRefreshAt.current && elapsed < MIN_SERVER_REFRESH_MS) {
      return serverTimeRef.current;
    }

    lastServerRefreshAt.current = now;
    try {
      if (!isValidTimezone(user?.timezone)) {
        await ensureServerTimezone();
        return serverTimeRef.current;
      }
      const { response, payload } = await authRequest("/api/preferences", { token });
      if (!response.ok || !payload?.time || !isValidTimezone(payload.preferences?.timezone)) {
        throw new Error("timezoneRefreshFailed");
      }
      if (payload.preferences.timezone !== user?.timezone) {
        updateUserTimezone(payload.preferences.timezone, payload.time);
        setTimezoneState(payload.preferences.timezone);
      }
      acceptServerTime(payload.time);
      return payload.time;
    } catch {
      setServerTime(null);
      serverTimeRef.current = null;
      return null;
    }
  }, [isAuthenticated, token, isOnline, ensureServerTimezone, user?.timezone, updateUserTimezone, acceptServerTime]);

  const serverRefreshDelay = Math.max(0, MIN_SERVER_REFRESH_MS - (performance.now() - lastServerRefreshAt.current));
  const canUseServerTime = isAuthenticated && isOnline;

  const setTimezone = useCallback(async (nextTimezone) => {
    if (!isValidTimezone(nextTimezone)) {
      showToast(t("timezoneInvalid", {}, language), "danger");
      return false;
    }
    try {
      if (isAuthenticated && token) {
        const { response, payload } = await authRequest("/api/preferences", {
          method: "PATCH",
          token,
          body: { timezone: nextTimezone }
        });
        if (!response.ok || !isValidTimezone(payload?.preferences?.timezone)) {
          throw new Error("timezoneSaveFailed");
        }
        setTimezoneState(payload.preferences.timezone);
        updateUserTimezone(payload.preferences.timezone, payload.time);
        acceptServerTime(payload.time);
      } else {
        writeLocalTimezone(nextTimezone);
        setTimezoneState(nextTimezone);
      }
      return true;
    } catch {
      showToast(t("timezoneSaveFailed", {}, language), "danger");
      return false;
    }
  }, [isAuthenticated, token, updateUserTimezone, acceptServerTime, showToast, language]);

  const ignoreMismatch = useCallback((key) => {
    try {
      const saved = JSON.parse(localStorage.getItem(IGNORED_MISMATCH_KEY) || "[]");
      const ignored = Array.isArray(saved) ? saved : [];
      if (!ignored.includes(key)) ignored.push(key);
      localStorage.setItem(IGNORED_MISMATCH_KEY, JSON.stringify(ignored));
      return true;
    } catch {
      showToast(t("timezoneSaveFailed", {}, language), "danger");
      return false;
    }
  }, [showToast, language]);

  useEffect(() => {
    if (!isAuthenticated || !isValidTimezone(user?.timezone) || user.timezone === browserTimezone) return;
    const key = mismatchKey(user.timezone, browserTimezone);
    if (shownMismatchRef.current.has(key)) return;
    try {
      const ignored = JSON.parse(localStorage.getItem(IGNORED_MISMATCH_KEY) || "[]");
      if (Array.isArray(ignored) && ignored.includes(key)) return;
    } catch {
      showToast(t("timezoneSaveFailed", {}, language), "danger");
    }
    shownMismatchRef.current.add(key);
    showToast(t("timezoneMismatch", { timezone: user.timezone }, language), "alert", 0, [
      {
        label: t("timezoneUseCurrent", {}, language),
        onClick: () => setTimezone(browserTimezone)
      },
      {
        label: t("timezoneIgnore", {}, language),
        onClick: () => ignoreMismatch(key)
      }
    ]);
  }, [isAuthenticated, user?.timezone, browserTimezone, language, showToast, setTimezone, ignoreMismatch]);

  const today = useToday({
    timezone,
    serverTime: canUseServerTime && serverTime ? {
      ...serverTime,
      delayMs: Math.max(
        0,
        Date.parse(serverTime.nextMidnightAt) - Date.parse(serverTime.serverNow) -
          (performance.now() - (serverTime.receivedAtMonotonic ?? performance.now()))
      )
    } : canUseServerTime ? { delayMs: serverRefreshDelay } : null,
    isOnline: canUseServerTime,
    refreshServerTime,
    serverRefreshDelay
  });

  const value = useMemo(() => ({
    timezone,
    browserTimezone,
    today: canUseServerTime && serverTime ? serverTime.today : today || localToday(new Date(), timezone),
    isOnline,
    serverTime,
    setTimezone,
    ensureServerTimezone,
    refreshServerTime,
    acceptServerTime,
    adoptServerTimezone
  }), [timezone, browserTimezone, today, canUseServerTime, isOnline, serverTime, setTimezone, ensureServerTimezone, refreshServerTime, acceptServerTime, adoptServerTimezone]);

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}
