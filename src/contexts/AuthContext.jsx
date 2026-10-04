import React, { createContext, useState, useEffect, useCallback, useRef } from "react";
import {
  AUTH_SESSION_KEY,
  AUTH_TOKEN_KEY,
  readAuthSession,
  saveAuthSession,
  clearAuthSession,
  validAuthUser
} from "../services/authStorage.js";
import { restoreAuthSession } from "../services/authSession.js";
import { completeGoogleLogin } from "../services/googleAuth.js";
import { authRequest } from "../services/api.js";
import { detectedTimezone, isValidTimezone } from "../utils/date.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [initialSession] = useState(() => readAuthSession());
  const [status, setStatus] = useState("loading");
  const [connectionStatus, setConnectionStatus] = useState(initialSession ? "checking" : "online");
  const [token, setToken] = useState(initialSession?.token ?? null);
  const [refreshToken, setRefreshToken] = useState(initialSession?.refreshToken ?? null);
  const [user, setUser] = useState(initialSession?.user ?? null);
  const [time, setTime] = useState(null);
  const [noticeKey, setNoticeKey] = useState(null);
  const [formErrorKey, setFormErrorKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const authOperationRef = useRef(0);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef(null);
  const restoreSessionRef = useRef(null);

  const scheduleRetry = useCallback((operation) => {
    clearTimeout(retryTimerRef.current);
    const delay = Math.min(2000 * (2 ** retryAttemptRef.current), 30000);
    retryAttemptRef.current++;
    retryTimerRef.current = setTimeout(() => {
      if (operation === authOperationRef.current) restoreSessionRef.current?.();
    }, delay);
  }, []);

  const ensureTimezone = useCallback(async (nextUser, accessToken, initialTime) => {
    if (isValidTimezone(nextUser.timezone)) return { user: nextUser, time: initialTime || null };
    const result = await authRequest("/api/preferences", {
      method: "PATCH",
      token: accessToken,
      body: { timezone: detectedTimezone() }
    });
    if (!result.response.ok || !isValidTimezone(result.payload?.preferences?.timezone)) {
      throw new Error("timezoneSaveFailed");
    }
    return {
      user: { ...nextUser, timezone: result.payload.preferences.timezone },
      time: result.payload.time || initialTime || null
    };
  }, []);

  const restoreSession = useCallback(async () => {
    clearTimeout(retryTimerRef.current);
    const currentOp = ++authOperationRef.current;
    const savedSession = readAuthSession();
    setNoticeKey(null);
    setFormErrorKey(null);

    if (!savedSession) {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      setTime(null);
      setStatus("unauthenticated");
      setConnectionStatus("online");
      return;
    }

    setToken(savedSession.token);
    setRefreshToken(savedSession.refreshToken);
    if (savedSession.user) setUser(savedSession.user);
    setStatus(savedSession.user ? "authenticated" : "loading");
    setConnectionStatus("checking");

    const restored = await restoreAuthSession(savedSession);
    if (currentOp !== authOperationRef.current) return;

    if (restored.kind === "expired") {
      clearAuthSession();
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      setTime(null);
      setStatus("unauthenticated");
      setConnectionStatus("online");
      setNoticeKey("authSessionExpired");
      retryAttemptRef.current = 0;
      return;
    }

    if (restored.kind !== "authenticated") {
      setStatus("backendUnavailable");
      setConnectionStatus("offline");
      scheduleRetry(currentOp);
      return;
    }

    setToken(restored.session.token);
    setRefreshToken(restored.session.refreshToken);
    setUser(restored.session.user);
    setTime(restored.time || null);
    saveAuthSession(restored.session);

    try {
      const resolved = await ensureTimezone(restored.session.user, restored.session.token, restored.time);
      if (currentOp !== authOperationRef.current) return;
      setUser(resolved.user);
      setTime(resolved.time);
      saveAuthSession({ ...restored.session, user: resolved.user });
      setStatus("authenticated");
      setConnectionStatus("online");
      retryAttemptRef.current = 0;
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setStatus("backendUnavailable");
        setConnectionStatus("offline");
        scheduleRetry(currentOp);
      }
    }
  }, [ensureTimezone, scheduleRetry]);

  useEffect(() => {
    restoreSessionRef.current = restoreSession;
  }, [restoreSession]);

  useEffect(() => {
    restoreSession();
    const handleOnline = () => {
      if (readAuthSession()) {
        retryAttemptRef.current = 0;
        restoreSessionRef.current?.();
      }
    };
    const handleStorage = (event) => {
      if (event.key === AUTH_SESSION_KEY || event.key === AUTH_TOKEN_KEY) {
        restoreSessionRef.current?.();
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", handleStorage);
    return () => {
      ++authOperationRef.current;
      clearTimeout(retryTimerRef.current);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("storage", handleStorage);
    };
  }, [restoreSession]);

  const retrySession = useCallback(() => {
    retryAttemptRef.current = 0;
    return restoreSession();
  }, [restoreSession]);

  const acceptLogin = useCallback(async (payload, currentOp) => {
    if (
      typeof payload?.token !== "string" ||
      typeof payload?.refreshToken !== "string" ||
      !validAuthUser(payload.user)
    ) {
      setStatus("backendUnavailable");
      setConnectionStatus("offline");
      setFormErrorKey("authServerError");
      return { success: false, errorKey: "authServerError" };
    }

    const session = { token: payload.token, refreshToken: payload.refreshToken, user: payload.user };
    const saved = saveAuthSession(session);
    setToken(session.token);
    setRefreshToken(session.refreshToken);
    setUser(session.user);
    setTime(payload.time || null);
    setStatus("authenticated");
    setConnectionStatus("online");
    setFormErrorKey(null);
    setNoticeKey(saved ? null : "authTokenNotSaved");

    try {
      const resolved = await ensureTimezone(session.user, session.token, payload.time);
      if (currentOp !== authOperationRef.current) return { success: false };
      const updatedSession = { ...session, user: resolved.user };
      saveAuthSession(updatedSession);
      setUser(resolved.user);
      setTime(resolved.time);
      return { success: true, user: resolved.user, token: session.token };
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setStatus("backendUnavailable");
        setConnectionStatus("offline");
        scheduleRetry(currentOp);
      }
      return { success: true, user: session.user, token: session.token };
    }
  }, [ensureTimezone, scheduleRetry]);

  const login = useCallback(async (email, password) => {
    setIsSubmitting(true);
    setFormErrorKey(null);
    setNoticeKey(null);
    const currentOp = ++authOperationRef.current;

    try {
      const { response, payload } = await authRequest("/api/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password }
      });

      if (currentOp !== authOperationRef.current) return { success: false };

      if (!response.ok) {
        setStatus([400, 401].includes(response.status) ? "unauthenticated" : "backendUnavailable");
        setConnectionStatus(response.status >= 500 ? "offline" : "online");
        const errKey = response.status === 401 ? "authInvalidCredentials" : "authServerError";
        setFormErrorKey(errKey);
        return { success: false, errorKey: errKey };
      }

      return await acceptLogin(payload, currentOp);
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setStatus("backendUnavailable");
        setConnectionStatus("offline");
        setFormErrorKey("authNetworkError");
      }
      return { success: false, errorKey: "authNetworkError" };
    } finally {
      if (currentOp === authOperationRef.current) setIsSubmitting(false);
    }
  }, [acceptLogin]);

  const loginWithGoogle = useCallback(async (credential, password = null) => {
    setIsSubmitting(true);
    setFormErrorKey(null);
    setNoticeKey(null);
    const currentOp = ++authOperationRef.current;

    try {
      const result = await completeGoogleLogin({
        credential,
        password,
        acceptSession: (payload) => acceptLogin(payload, currentOp)
      });
      if (currentOp !== authOperationRef.current) return { success: false };
      if (!result.success && !result.requiresPassword) {
        setFormErrorKey(result.errorKey);
        setConnectionStatus(result.errorKey === "authGoogleUnavailable" ? "offline" : "online");
      }
      return result;
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setConnectionStatus("offline");
        setFormErrorKey("authGoogleUnavailable");
      }
      return { success: false, errorKey: "authGoogleUnavailable" };
    } finally {
      if (currentOp === authOperationRef.current) setIsSubmitting(false);
    }
  }, [acceptLogin]);

  const register = useCallback(async (email, password) => {
    setIsSubmitting(true);
    setFormErrorKey(null);
    setNoticeKey(null);
    const currentOp = ++authOperationRef.current;
    let accountCreated = false;

    try {
      const created = await authRequest("/api/auth/register", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password }
      });

      if (currentOp !== authOperationRef.current) return { success: false };

      if (!created.response.ok) {
        setStatus([400, 409].includes(created.response.status) ? "unauthenticated" : "backendUnavailable");
        setConnectionStatus(created.response.status >= 500 ? "offline" : "online");
        const errKey = created.response.status === 409 ? "authDuplicateEmail" : created.response.status === 400 ? "authInvalidRequest" : "authServerError";
        setFormErrorKey(errKey);
        return { success: false, errorKey: errKey };
      }

      accountCreated = true;
      const loginResult = await authRequest("/api/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password }
      });

      if (currentOp !== authOperationRef.current) return { success: false };

      if (!loginResult.response.ok) {
        setNoticeKey("authRegistrationNeedsLogin");
        setStatus("unauthenticated");
        setConnectionStatus("online");
        return { success: false, needsLogin: true };
      }

      return await acceptLogin(loginResult.payload, currentOp);
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setStatus("backendUnavailable");
        setConnectionStatus("offline");
        if (accountCreated) setNoticeKey("authRegistrationNeedsLogin");
        setFormErrorKey("authNetworkError");
      }
      return { success: false, errorKey: "authNetworkError" };
    } finally {
      if (currentOp === authOperationRef.current) setIsSubmitting(false);
    }
  }, [acceptLogin]);

  const logout = useCallback(async () => {
    const savedSession = readAuthSession();
    ++authOperationRef.current;
    clearTimeout(retryTimerRef.current);
    clearAuthSession();
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setTime(null);
    setStatus("unauthenticated");
    setConnectionStatus("online");
    setNoticeKey(null);
    setFormErrorKey(null);
    setIsSubmitting(false);

    if (!savedSession?.refreshToken) return { revoked: true };
    try {
      const { response } = await authRequest("/api/auth/logout", {
        method: "POST",
        body: { refreshToken: savedSession.refreshToken },
        timeoutMs: 10000
      });
      return { revoked: response.ok };
    } catch (_) {
      return { revoked: false };
    }
  }, []);

  const updateUserTimezone = useCallback((timezone, nextTime = null) => {
    const session = readAuthSession();
    if (session?.user) {
      saveAuthSession({ ...session, user: { ...session.user, timezone } });
    }
    setUser((current) => {
      if (!current) return current;
      return { ...current, timezone };
    });
    if (nextTime) setTime(nextTime);
  }, []);

  const clearErrors = useCallback(() => {
    setFormErrorKey(null);
    setNoticeKey(null);
  }, []);

  const value = {
    status,
    connectionStatus,
    isAuthenticated: Boolean(token && user),
    hasSession: Boolean(token),
    isLoading: status === "loading" && !token,
    isBackendUnavailable: status === "backendUnavailable",
    token,
    user,
    time,
    noticeKey,
    formErrorKey,
    isSubmitting,
    login,
    loginWithGoogle,
    register,
    logout,
    updateUserTimezone,
    restoreSession: retrySession,
    retrySession,
    clearErrors
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
