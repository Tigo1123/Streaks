import { authRequest } from "./api.js";
import { clearAuthSession, readAuthSession, saveAuthSession, validAuthUser } from "./authStorage.js";

const requestTimeoutMs = 90000;
const refreshLockName = "streaks-auth-refresh";

function sameSession(left, right) {
  return left?.token === right.token && left?.refreshToken === right.refreshToken;
}

async function withRefreshLock(callback) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request(refreshLockName, { mode: "exclusive" }, callback);
  }
  return callback();
}

async function refreshSession(previousSession, request) {
  try {
    return await withRefreshLock(async () => {
      const current = readAuthSession();
      if (!current) return { kind: "expired" };
      if (current.token !== previousSession.token && current.refreshToken) {
        return { kind: "refreshed", session: current };
      }
      if (!current.refreshToken) return { kind: "expired" };

      const { response, payload } = await request("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken: current.refreshToken },
        timeoutMs: requestTimeoutMs
      });
      if (response.status === 401) {
        const latest = readAuthSession();
        if (latest && !sameSession(latest, current)) return { kind: "refreshed", session: latest };
        return { kind: "expired" };
      }
      if (!response.ok) return { kind: "unavailable" };
      if (
        typeof payload?.token !== "string" ||
        typeof payload?.refreshToken !== "string" ||
        !validAuthUser(payload.user)
      ) {
        return { kind: "unavailable" };
      }

      const latest = readAuthSession();
      if (!latest) return { kind: "expired" };
      if (!sameSession(latest, current)) return { kind: "refreshed", session: latest };

      const session = { token: payload.token, refreshToken: payload.refreshToken, user: payload.user };
      saveAuthSession(session);
      return { kind: "refreshed", session, time: payload.time };
    });
  } catch (_) {
    return { kind: "unavailable" };
  }
}

function clearIfCurrentSession(session) {
  const current = readAuthSession();
  if (sameSession(current, session)) clearAuthSession();
}

export async function restoreAuthSession(session, request = authRequest) {
  if (!session?.token) return { kind: "empty" };

  try {
    let activeSession = session;
    let result = await request("/api/auth/me", {
      token: activeSession.token,
      timeoutMs: requestTimeoutMs
    });

    if (result.response.status === 401) {
      const refreshed = await refreshSession(activeSession, request);
      if (refreshed.kind === "expired") {
        clearIfCurrentSession(activeSession);
        return refreshed;
      }
      if (refreshed.kind !== "refreshed") return refreshed;
      activeSession = refreshed.session;
      result = await request("/api/auth/me", {
        token: activeSession.token,
        timeoutMs: requestTimeoutMs
      });
    }

    if (result.response.status === 401) return { kind: "unavailable" };
    if (!result.response.ok || !validAuthUser(result.payload?.user)) {
      return { kind: "unavailable" };
    }

    const currentSession = readAuthSession();
    if (!sameSession(currentSession, activeSession)) return { kind: "unavailable" };
    const restoredSession = { ...activeSession, user: result.payload.user };
    saveAuthSession(restoredSession);
    return { kind: "authenticated", session: restoredSession, time: result.payload.time };
  } catch (_) {
    return { kind: "unavailable" };
  }
}
