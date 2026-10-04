import { normalizeDisplayName } from "../utils/profile.js";

export const LOCAL_PROFILE_KEY = "streaks-local-profile-v1";

export function readLocalDisplayName() {
  try {
    const value = normalizeDisplayName(localStorage.getItem(LOCAL_PROFILE_KEY) || "");
    return value || "";
  } catch {
    return "";
  }
}

export function saveLocalDisplayName(value) {
  const normalized = normalizeDisplayName(value);
  if (normalized === null) return false;
  try {
    if (normalized) localStorage.setItem(LOCAL_PROFILE_KEY, normalized);
    else localStorage.removeItem(LOCAL_PROFILE_KEY);
    return true;
  } catch {
    return false;
  }
}
