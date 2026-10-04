const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDisplayName, optionalDisplayName } = require("../src/utils/profile");

test("display names are trimmed and limited to 50 Unicode characters", () => {
  assert.equal(normalizeDisplayName("  A name  "), "A name");
  assert.equal(normalizeDisplayName("🙂".repeat(50)), "🙂".repeat(50));
  assert.equal(normalizeDisplayName("🙂".repeat(51)), null);
  assert.equal(normalizeDisplayName("  "), null);
});

test("display names reject control characters and optional registration names may be blank", () => {
  assert.equal(normalizeDisplayName("line\nbreak"), null);
  assert.equal(normalizeDisplayName(`tab\tname`), null);
  assert.equal(optionalDisplayName(undefined), null);
  assert.equal(optionalDisplayName("  "), null);
  assert.equal(optionalDisplayName("  Name  "), "Name");
});
