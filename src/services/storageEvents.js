import { loadRawValue, STORAGE_KEY } from "./storage.js";

export function handleStorageEvent(event, currentRaw, fallbackState, update) {
  if (event.key !== STORAGE_KEY || event.storageArea !== localStorage) return false;
  if (event.newValue === currentRaw) return false;

  let latest;
  try {
    latest = loadRawValue(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    latest = {
      ok: false,
      state: fallbackState,
      raw: null,
      error: { code: "storage-unavailable", cause: error },
      quarantinedCount: 0
    };
  }
  update(latest);
  return true;
}
