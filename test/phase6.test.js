import test from "node:test";
import assert from "node:assert/strict";
import { localToday, nextMidnightInZone, scheduleTodayRollover } from "../src/utils/date.js";
import fs from "node:fs";
import path from "node:path";
import { normalizeDisplayName } from "../src/utils/profile.js";
import { LOCAL_PROFILE_KEY, readLocalDisplayName, saveLocalDisplayName } from "../src/services/profileStorage.js";

test("configured timezone determines the date independently of the device timezone", () => {
  const instant = new Date("2026-01-01T12:30:00.000Z");
  assert.equal(localToday(instant, "UTC"), "2026-01-01");
  assert.equal(localToday(instant, "Pacific/Apia"), "2026-01-02");
  assert.equal(localToday(new Date("2026-01-02T05:30:00.000Z"), "Pacific/Pago_Pago"), "2026-01-01");
});

test("next-midnight rollover rechecks the configured date using fake timers", (t) => {
  const start = Date.parse("2026-03-08T04:59:59.000Z");
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: start });
  let rolledOverTo = null;
  const cancel = scheduleTodayRollover({
    timezone: "America/New_York",
    onRollover: () => {
      rolledOverTo = localToday(new Date(), "America/New_York");
    }
  });

  t.mock.timers.tick(1999);
  assert.equal(rolledOverTo, null);
  t.mock.timers.tick(1);
  assert.equal(rolledOverTo, "2026-03-08");
  cancel();
});

test("configured-zone midnight spans 23 and 25 hours over daylight-saving changes", () => {
  const springStart = new Date("2026-03-08T05:00:00.000Z");
  assert.equal(nextMidnightInZone("America/New_York", springStart) - springStart, 23 * 60 * 60 * 1000);
  const fallStart = new Date("2026-11-01T04:00:00.000Z");
  assert.equal(nextMidnightInZone("America/New_York", fallStart) - fallStart, 25 * 60 * 60 * 1000);
});

test("display names normalize safely and local profile names persist outside synced app data", () => {
  assert.equal(normalizeDisplayName("  A name  "), "A name");
  assert.equal(normalizeDisplayName("x".repeat(51)), null);
  assert.equal(normalizeDisplayName("bad\nname"), null);

  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  try {
    assert.equal(saveLocalDisplayName("  Local User  "), true);
    assert.equal(readLocalDisplayName(), "Local User");
    assert.equal(values.get(LOCAL_PROFILE_KEY), "Local User");
    assert.equal(saveLocalDisplayName(" "), true);
    assert.equal(readLocalDisplayName(), "");
    assert.equal(values.has(LOCAL_PROFILE_KEY), false);
    assert.equal(saveLocalDisplayName("bad\u0000name"), false);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test("profile presentation does not expose email in the header or greeting", () => {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const topNav = fs.readFileSync(path.join(projectRoot, "src/components/layout/TopNav.jsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/DashboardView.jsx"), "utf8");
  const settings = fs.readFileSync(path.join(projectRoot, "src/components/modals/SettingsModal.jsx"), "utf8");
  const authModal = fs.readFileSync(path.join(projectRoot, "src/components/modals/AuthModal.jsx"), "utf8");

  assert.equal(topNav.includes("user?.email"), false);
  assert.equal(topNav.includes("split(\"@\")"), false);
  assert.equal(dashboard.includes("user.email"), false);
  assert.ok(dashboard.includes("user?.displayName"));
  assert.ok(settings.includes("user.email"));
  assert.ok(authModal.includes("authNameOptional"));
});

test("mobile shell keeps core navigation visible and provides inline vector icons", () => {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const topNav = fs.readFileSync(path.join(projectRoot, "src/components/layout/TopNav.jsx"), "utf8");
  const layoutCss = fs.readFileSync(path.join(projectRoot, "src/styles/layout.css"), "utf8");
  const componentsCss = fs.readFileSync(path.join(projectRoot, "src/styles/components.css"), "utf8");
  const statCards = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/StatCards.jsx"), "utf8");
  const todayPanel = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/TodayActionPanel.jsx"), "utf8");

  assert.ok(layoutCss.includes('grid-template-areas: "menu title account"'));
  assert.ok(layoutCss.includes(".topbar-create-btn"));
  assert.ok(layoutCss.includes("inset-inline-end: 16px"));
  assert.ok(componentsCss.includes("border-block-start: 1px solid var(--border-subtle)"));
  assert.ok(statCards.includes('<LineIcon name="target" />'));
  assert.ok(statCards.includes('<LineIcon name="chart" />'));
  assert.ok(todayPanel.includes('<LineIcon name="bolt"'));
  assert.equal(topNav.includes("🌐"), false);
});
