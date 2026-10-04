import { authRequest } from "./api.js";

export const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const scriptLoads = new WeakMap();

export function shouldShowGoogleSignIn(clientId, authView) {
  return typeof clientId === "string" && clientId.trim().length > 0 && authView === "login";
}

export function loadGoogleIdentity({
  documentObject = globalThis.document,
  windowObject = globalThis.window
} = {}) {
  if (windowObject?.google?.accounts?.id) return Promise.resolve(windowObject.google.accounts.id);
  if (!documentObject || !windowObject) return Promise.reject(new Error("Google Identity Services is unavailable"));

  const existing = scriptLoads.get(documentObject);
  if (existing) return existing;

  const script = documentObject.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`)
    || documentObject.createElement("script");
  if (!script.src) {
    script.src = GOOGLE_IDENTITY_SCRIPT_URL;
    script.async = true;
    script.defer = true;
  }

  const load = new Promise((resolve, reject) => {
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      if (windowObject.google?.accounts?.id) resolve(windowObject.google.accounts.id);
      else reject(new Error("Google Identity Services did not initialize"));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Google Identity Services could not be loaded"));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!script.isConnected) documentObject.head.appendChild(script);
  }).catch((error) => {
    scriptLoads.delete(documentObject);
    throw error;
  });

  scriptLoads.set(documentObject, load);
  return load;
}

export async function completeGoogleLogin({
  credential,
  password,
  request = authRequest,
  acceptSession
}) {
  const body = { credential };
  if (typeof password === "string") body.password = password;

  const { response, payload } = await request("/api/auth/google", {
    method: "POST",
    body
  });

  if (response.status === 409 && payload?.code === "GOOGLE_PASSWORD_CONFIRMATION_REQUIRED") {
    return { requiresPassword: true };
  }
  if (!response.ok) {
    return {
      success: false,
      errorKey: response.status === 401 ? "authGoogleFailed" : "authGoogleUnavailable"
    };
  }

  return acceptSession(payload);
}
