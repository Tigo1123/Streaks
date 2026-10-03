import React, { createContext, useState, useEffect, useCallback, useRef } from "react";
import { readAuthToken, saveAuthToken, clearAuthToken, validAuthUser } from "../services/authStorage.js";
import { authRequest } from "../services/api.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading"); // "loading" | "authenticated" | "unauthenticated" | "backendUnavailable"
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [noticeKey, setNoticeKey] = useState(null);
  const [formErrorKey, setFormErrorKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const authOperationRef = useRef(0);

  const restoreSession = useCallback(async () => {
    const savedToken = readAuthToken();
    setToken(savedToken);
    setUser(null);
    setNoticeKey(null);

    if (!savedToken) {
      setStatus("unauthenticated");
      return;
    }

    const currentOp = ++authOperationRef.current;
    setStatus("loading");

    try {
      const { response, payload } = await authRequest("/api/auth/me", { token: savedToken });
      if (currentOp !== authOperationRef.current) return;

      if (response.status === 401) {
        clearAuthToken();
        setToken(null);
        setUser(null);
        setStatus("unauthenticated");
        setNoticeKey("authSessionExpired");
      } else if (!response.ok || !validAuthUser(payload?.user)) {
        setStatus("backendUnavailable");
      } else {
        setStatus("authenticated");
        setUser(payload.user);
        setToken(savedToken);
      }
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setStatus("backendUnavailable");
      }
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

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
        const errKey = response.status === 401 ? "authInvalidCredentials" : "authServerError";
        setFormErrorKey(errKey);
        return { success: false, errorKey: errKey };
      }

      if (typeof payload?.token === "string" && validAuthUser(payload.user)) {
        saveAuthToken(payload.token);
        setToken(payload.token);
        setUser(payload.user);
        setStatus("authenticated");
        setFormErrorKey(null);
        setNoticeKey(null);
        return { success: true, user: payload.user, token: payload.token };
      }

      setStatus("backendUnavailable");
      setFormErrorKey("authServerError");
      return { success: false, errorKey: "authServerError" };
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setStatus("backendUnavailable");
        setFormErrorKey("authNetworkError");
      }
      return { success: false, errorKey: "authNetworkError" };
    } finally {
      if (currentOp === authOperationRef.current) {
        setIsSubmitting(false);
      }
    }
  }, []);

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
        const errKey = created.response.status === 409 ? "authDuplicateEmail" : created.response.status === 400 ? "authInvalidRequest" : "authServerError";
        setFormErrorKey(errKey);
        return { success: false, errorKey: errKey };
      }

      accountCreated = true;

      // Auto-login upon successful registration
      const loginResult = await authRequest("/api/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password }
      });

      if (currentOp !== authOperationRef.current) return { success: false };

      if (!loginResult.response.ok) {
        setNoticeKey("authRegistrationNeedsLogin");
        setStatus("unauthenticated");
        return { success: false, needsLogin: true };
      }

      if (typeof loginResult.payload?.token === "string" && validAuthUser(loginResult.payload.user)) {
        saveAuthToken(loginResult.payload.token);
        setToken(loginResult.payload.token);
        setUser(loginResult.payload.user);
        setStatus("authenticated");
        setFormErrorKey(null);
        setNoticeKey(null);
        return { success: true, user: loginResult.payload.user, token: loginResult.payload.token };
      }

      setNoticeKey("authRegistrationNeedsLogin");
      setStatus("unauthenticated");
      return { success: false, needsLogin: true };
    } catch (_) {
      if (currentOp === authOperationRef.current) {
        setStatus("backendUnavailable");
        if (accountCreated) {
          setNoticeKey("authRegistrationNeedsLogin");
          setFormErrorKey("authNetworkError");
        } else {
          setFormErrorKey("authNetworkError");
        }
      }
      return { success: false, errorKey: "authNetworkError" };
    } finally {
      if (currentOp === authOperationRef.current) {
        setIsSubmitting(false);
      }
    }
  }, []);

  const logout = useCallback(() => {
    ++authOperationRef.current;
    clearAuthToken();
    setToken(null);
    setUser(null);
    setStatus("unauthenticated");
    setNoticeKey(null);
    setFormErrorKey(null);
    setIsSubmitting(false);
  }, []);

  const clearErrors = useCallback(() => {
    setFormErrorKey(null);
    setNoticeKey(null);
  }, []);

  const value = {
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    isBackendUnavailable: status === "backendUnavailable",
    token,
    user,
    noticeKey,
    formErrorKey,
    isSubmitting,
    login,
    register,
    logout,
    restoreSession,
    clearErrors
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
