export const AUTH_TOKEN_KEY = "streaks-auth-token";

/**
 * Reads JWT token from sessionStorage.
 * Survives page reloads within the same tab, but cleared when tab is closed.
 *
 * @returns {string | null}
 */
export function readAuthToken() {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

/**
 * Saves JWT token to sessionStorage.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function saveAuthToken(token) {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Clears JWT token from sessionStorage.
 */
export function clearAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {
    // Ignore storage errors on clear
  }
}

/**
 * Validates the user object structure returned by the authentication API.
 *
 * @param {any} user
 * @returns {boolean}
 */
export function validAuthUser(user) {
  return (
    user !== null &&
    typeof user === "object" &&
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    user.email.length <= 254
  );
}
