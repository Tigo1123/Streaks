export function normalizeDisplayName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    Array.from(trimmed).length > 50 ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}
