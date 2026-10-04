function normalizeDisplayName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (
    !name ||
    Array.from(name).length > 50 ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(name)
  ) {
    return null;
  }
  return name;
}

function optionalDisplayName(value) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return null;
  }
  return normalizeDisplayName(value);
}

module.exports = { normalizeDisplayName, optionalDisplayName };
