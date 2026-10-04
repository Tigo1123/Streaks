export const AUTH_SESSION_KEY = "streaks-auth-session";
export const AUTH_TOKEN_KEY = "streaks-auth-token";

function parseSession(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && typeof value.token === "string") {
      return {
        token: value.token,
        refreshToken: typeof value.refreshToken === "string" ? value.refreshToken : null,
        user: validAuthUser(value.user) ? value.user : null
      };
    }
  } catch (_) {
    return null;
  }
  return null;
}

/**
 * Reads the persistent session, migrating the old per-tab token when possible.
 *
 * @returns {{ token: string, refreshToken: string | null, user: object | null } | null}
 */
export function readAuthSession() {
  try {
    const saved = parseSession(localStorage.getItem(AUTH_SESSION_KEY));
    if (saved) return saved;

    const legacyToken = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (!legacyToken) return null;

    const migrated = { token: legacyToken, refreshToken: null, user: null };
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(migrated));
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    return migrated;
  } catch (_) {
    return null;
  }
}

export function readAuthToken() {
  return readAuthSession()?.token ?? null;
}

/**
 * Persists the current access token, rotating refresh token, and minimal user identity.
 *
 * @param {{ token: string, refreshToken?: string | null, user?: object | null }} session
 * @returns {boolean}
 */
export function saveAuthSession(session) {
  if (!session || typeof session.token !== "string" || !session.token) return false;
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      token: session.token,
      refreshToken: typeof session.refreshToken === "string" ? session.refreshToken : null,
      user: validAuthUser(session.user) ? session.user : null
    }));
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

export function saveAuthToken(token) {
  return saveAuthSession({ token });
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {
    // Keep clearing the legacy tab-scoped token even if localStorage is unavailable.
  }
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {
    // Ignore storage errors while clearing a session.
  }
}

export const clearAuthSession = clearAuthToken;

/**
 * Validates the required fields while allowing additive API fields such as timezone.
 *
 * @param {any} user
 * @returns {boolean}
 */
export function validAuthUser(user) {
  return (
    user !== null &&
    typeof user === "object" &&
    !Array.isArray(user) &&
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    user.email.length <= 254
  );
}
