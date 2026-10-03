import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dayIndex, localToday } from "../src/utils/date.js";
import { progress, streakStats, status as getStatus, remaining } from "../src/utils/streakCalculations.js";
import { validImportChallenge, createInitialState, VERSION } from "../src/services/storage.js";
import { en } from "../src/i18n/en.js";
import { ar } from "../src/i18n/ar.js";
import { completionDistribution } from "../src/utils/statistics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("Phase 5 - StatCards Calculation Equivalence", () => {
  const challenges = [
    {
      id: "c1",
      name: "Morning Run",
      durationDays: 30,
      startDate: localToday(),
      completedDays: [1, 2, 3],
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "c2",
      name: "Read 20 Pages",
      durationDays: 10,
      startDate: localToday(),
      completedDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // completed (100%)
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "c3",
      name: "Meditation",
      durationDays: 20,
      startDate: "2020-01-01",
      completedDays: [1, 2, 4], // missed day 3 in the past
      createdAt: "2020-01-01T00:00:00.000Z"
    }
  ];

  let activeCount = 0;
  let totalCompletedDays = 0;
  let totalChallengeDays = 0;
  let bestStreak = 0;

  for (const c of challenges) {
    const s = getStatus(c);
    if (s === "active") activeCount++;
    totalCompletedDays += c.completedDays.length;
    totalChallengeDays += c.durationDays;
    const stats = streakStats(c);
    if (stats.longest > bestStreak) {
      bestStreak = stats.longest;
    }
  }

  const completionRate = Math.round((totalCompletedDays / totalChallengeDays) * 100);

  // c1 is active (completed day 1 up to elapsed = 1)
  // c2 is completed (10/10 = 100%)
  // c3 is missed (day 3 missing and elapsed > 3)
  assert.equal(activeCount, 1, "Only c1 should be in active status");
  assert.equal(totalCompletedDays, 16, "Total completed days should be 3 + 10 + 3 = 16");
  assert.equal(totalChallengeDays, 60, "Total challenge days should be 30 + 10 + 20 = 60");
  assert.equal(bestStreak, 10, "Best streak should be 10 from c2");
  assert.equal(completionRate, 27, "Completion rate should be 16/60 = 27%");
});

test("Phase 6 - Due-day distribution excludes future challenge days", () => {
  const challenges = [
    {
      startDate: "2026-06-05",
      durationDays: 10,
      completedDays: [1, 2, 6, 7]
    },
    {
      startDate: "2026-06-11",
      durationDays: 5,
      completedDays: []
    },
    {
      startDate: "2026-06-01",
      durationDays: 3,
      completedDays: [1, 3]
    }
  ];

  assert.deepEqual(completionDistribution(challenges, "2026-06-10"), {
    completed: 5,
    missed: 4,
    due: 9,
    completedPercent: 56,
    missedPercent: 44
  });
  assert.deepEqual(completionDistribution([challenges[1]], "2026-06-10"), {
    completed: 0,
    missed: 0,
    due: 0,
    completedPercent: 0,
    missedPercent: 0
  });
});

test("Phase 6 - Distribution card is accessible, localized, and dashboard-only", () => {
  const card = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/DistributionCard.jsx"), "utf8");
  const statCards = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/StatCards.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "src/styles/components.css"), "utf8");

  assert.ok(card.includes('role="img"'), "Distribution bar has an image role");
  assert.ok(card.includes("aria-label={description}"), "Distribution bar has a textual description");
  assert.ok(card.includes('t("completed"'), "Completed category uses the shared localized label");
  assert.ok(card.includes('t("missed"'), "Missed category uses the shared localized label");
  assert.ok(statCards.includes("<DistributionCard"), "Distribution is rendered in dashboard statistics");
  assert.ok(styles.includes(".distribution-card"), "Distribution card has scoped visual styles");
  for (const key of ["distributionTitle", "distributionDescription"]) {
    assert.equal(typeof en[key], "string", `English distribution translation exists for ${key}`);
    assert.equal(typeof ar[key], "string", `Arabic distribution translation exists for ${key}`);
  }
});

test("Phase 5 - Today Action Panel Logic", () => {
  const ongoing = {
    id: "ongoing-1",
    name: "Ongoing Habit",
    durationDays: 30,
    startDate: localToday(),
    completedDays: [1],
    createdAt: "2026-01-01T00:00:00.000Z"
  };

  const day = dayIndex(ongoing);
  assert.equal(day, 1, "Day index for today start should be 1");
  const isDueToday = day >= 1 && day <= ongoing.durationDays;
  assert.equal(isDueToday, true, "Challenge starting today is due today");
  const isDoneToday = isDueToday && ongoing.completedDays.includes(day);
  assert.equal(isDoneToday, true, "Day 1 is in completedDays so it is done today");

  // Future challenge
  const future = {
    id: "future-1",
    name: "Future Habit",
    durationDays: 30,
    startDate: "2099-01-01",
    completedDays: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  const futureDay = dayIndex(future);
  assert.ok(futureDay < 1, "Future challenge has dayIndex < 1");
  const futureDue = futureDay >= 1 && futureDay <= future.durationDays;
  assert.equal(futureDue, false, "Future challenge must not be due today");
});

test("Phase 5 - DayGrid Matrix Generation & Status Flags", () => {
  const challenge = {
    id: "test-grid",
    name: "Grid Test",
    durationDays: 7,
    startDate: localToday(),
    completedDays: [1],
    createdAt: "2026-01-01T00:00:00.000Z"
  };

  const today = dayIndex(challenge); // 1
  const days = Array.from({ length: challenge.durationDays }, (_, i) => {
    const n = i + 1;
    return {
      dayNumber: n,
      done: challenge.completedDays.includes(n),
      future: n > today,
      isToday: n === today
    };
  });

  assert.equal(days.length, 7, "Must generate exactly 7 day cells");
  assert.equal(days[0].dayNumber, 1);
  assert.equal(days[0].done, true, "Day 1 should be done");
  assert.equal(days[0].isToday, true, "Day 1 should be today");
  assert.equal(days[0].future, false, "Day 1 is not future");

  assert.equal(days[1].dayNumber, 2);
  assert.equal(days[1].done, false, "Day 2 is not done");
  assert.equal(days[1].future, true, "Day 2 is future");

  assert.equal(days[6].dayNumber, 7);
  assert.equal(days[6].future, true, "Day 7 is future");
});

test("Phase 5 - Import / Export Format Compatibility", () => {
  const validState = {
    version: VERSION,
    language: "en",
    challenges: [
      {
        id: "c1",
        name: "Morning Run",
        durationDays: 30,
        startDate: localToday(),
        completedDays: [1],
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    reminders: { enabled: true, lastReminderDate: "2026-01-01" }
  };

  const ids = new Set();
  const isValid =
    validState.version === VERSION &&
    Array.isArray(validState.challenges) &&
    validState.challenges.every((c) => {
      if (!validImportChallenge(c) || ids.has(c.id)) return false;
      ids.add(c.id);
      return true;
    }) &&
    ["en", "ar"].includes(validState.language);

  assert.equal(isValid, true, "Valid state must pass import validation");

  // Invalid state: duplicate ID
  const invalidDuplicate = {
    ...validState,
    challenges: [validState.challenges[0], validState.challenges[0]]
  };
  const dupIds = new Set();
  const dupValid = invalidDuplicate.challenges.every((c) => {
    if (!validImportChallenge(c) || dupIds.has(c.id)) return false;
    dupIds.add(c.id);
    return true;
  });
  assert.equal(dupValid, false, "Duplicate IDs must fail import validation");
});

test("Phase 5 - Dark Design System Token Integrity", () => {
  const variablesCss = fs.readFileSync(path.join(projectRoot, "src/styles/variables.css"), "utf8");
  const globalCss = fs.readFileSync(path.join(projectRoot, "src/styles/global.css"), "utf8");
  const componentsCss = fs.readFileSync(path.join(projectRoot, "src/styles/components.css"), "utf8");
  const modalsCss = fs.readFileSync(path.join(projectRoot, "src/styles/modals.css"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(projectRoot, "public/sw.js"), "utf8");

  assert.ok(variablesCss.includes("--color-bg-top: #0b0d1a;"), "Dark navy background token present");
  assert.ok(variablesCss.includes("--color-bg-bottom: #2b1f66;"), "Violet lower background token present");
  assert.ok(variablesCss.includes("--color-surface-glass: rgba(255, 255, 255, 0.06);"), "Glass surface token present");
  assert.ok(variablesCss.includes("--color-accent-violet: #7b5cff;"), "Violet accent token present");
  assert.ok(variablesCss.includes("--color-column-inactive: #2a2d4a;"), "Inactive chart token present");
  assert.ok(globalCss.includes('font-family: "Manrope"'), "Self-hosted Latin font family configured");
  assert.ok(globalCss.includes('font-family: "Tajawal"'), "Self-hosted Arabic font family configured");
  assert.ok(globalCss.includes("font-display: swap;"), "Fonts use swap display");
  assert.ok(globalCss.includes("background-image: var(--gradient-app);"), "Dark gradient canvas is applied");
  assert.ok(globalCss.includes("outline: 2px solid #b5a5ff;"), "Visible high-contrast focus outline is present");
  assert.ok(variablesCss.includes("--sidebar-width: 250px;"), "Sidebar width defined");
  assert.ok(variablesCss.includes("--topbar-height: 64px;"), "TopNav height defined");
  assert.ok(componentsCss.includes("min-height: 44px;"), "Primary controls meet minimum touch target");
  assert.ok(componentsCss.includes("background: var(--gradient-primary-button);"), "Primary button uses accessible violet-blue treatment");

  assert.ok(componentsCss.includes(".stat-card"), "stat-card class present");
  assert.ok(componentsCss.includes(".today-panel"), "today-panel class present");
  assert.ok(componentsCss.includes(".cards-grid"), "cards-grid class present");
  assert.ok(componentsCss.includes(".dashboard-table"), "dashboard-table class present");
  assert.ok(componentsCss.includes(".day-cell"), "day-cell class present");
  assert.ok(componentsCss.includes(".welcome-section"), "welcome-section class present");

  assert.ok(modalsCss.includes(".modal-backdrop"), "modal-backdrop present");
  assert.ok(modalsCss.includes(".modal-dialog"), "modal-dialog present");
  assert.ok(modalsCss.includes("@supports not (backdrop-filter: blur(1px))"), "Modal glass has a solid fallback");
  assert.ok(serviceWorker.includes('streaks-shell-v7'), "Service worker shell cache version was advanced");
  assert.ok(serviceWorker.includes('fonts/manrope-latin.woff2'), "Self-hosted fonts are cached for offline use");
});

test("Phase 6 - Dashboard progress rings are accessible and shared across cards", () => {
  const ring = fs.readFileSync(path.join(projectRoot, "src/components/common/ProgressRing.jsx"), "utf8");
  const statCards = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/StatCards.jsx"), "utf8");
  const todayPanel = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/TodayActionPanel.jsx"), "utf8");
  const challengeGrid = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/ChallengesGrid.jsx"), "utf8");
  const challengeTable = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/ChallengesTable.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "src/styles/components.css"), "utf8");
  const variables = fs.readFileSync(path.join(projectRoot, "src/styles/variables.css"), "utf8");

  assert.ok(ring.includes('role="img"'), "Progress ring exposes an image role");
  assert.ok(ring.includes("aria-label="), "Progress ring has a text alternative");
  assert.ok(ring.includes("strokeDashoffset={offset}"), "Progress ring maps the bounded percentage to its stroke");
  for (const [name, source] of [
    ["StatCards", statCards],
    ["TodayActionPanel", todayPanel],
    ["ChallengesGrid", challengeGrid],
    ["ChallengesTable", challengeTable]
  ]) {
    assert.ok(source.includes("<ProgressRing"), `${name} uses the shared progress ring`);
  }
  assert.ok(styles.includes(".progress-ring-outer"), "Ring includes a separate gradient outer stroke");
  assert.ok(styles.includes(".progress-ring-inner-track"), "Ring includes an inner progress track");
  assert.ok(styles.includes("font-variant-numeric: tabular-nums;"), "Ring values use stable, readable numerals");
  assert.ok(variables.includes("--color-primary: #a18cff;"), "Dashboard text accent meets contrast on the dark canvas");
});

test("Phase 6 - Challenge detail renders weekly bars and retains calendar controls", () => {
  const weekBars = fs.readFileSync(path.join(projectRoot, "src/components/challenge/WeekBars.jsx"), "utf8");
  const metrics = fs.readFileSync(path.join(projectRoot, "src/components/challenge/StreakMetrics.jsx"), "utf8");
  const detail = fs.readFileSync(path.join(projectRoot, "src/components/challenge/ChallengeDetail.jsx"), "utf8");
  const grid = fs.readFileSync(path.join(projectRoot, "src/components/challenge/DayGrid.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "src/styles/components.css"), "utf8");

  assert.ok(weekBars.includes('role="img"'), "Weekly bars expose a chart image role");
  assert.ok(weekBars.includes('aria-label={t("weekBarsDescription"'), "Weekly chart has localized text description");
  assert.ok(weekBars.includes("<FlameIcon />"), "Completed days receive a flame indicator");
  assert.ok(weekBars.includes("dayIndex(challenge, today)"), "Chart reads day from the configured today input");
  assert.ok(metrics.includes("<WeekBars"), "Streak metrics render the weekly chart");
  assert.ok(detail.includes("<StreakMetrics"), "Challenge detail includes streak metrics");
  assert.ok(grid.includes('disabled={future}'), "Future calendar days remain non-interactive");
  assert.ok(styles.includes("grid-template-columns: repeat(7, minmax(0, 1fr));"), "Weekly chart has seven columns");
  assert.ok(styles.includes("min-width: 44px;"), "Calendar day controls retain minimum touch size");
});

test("Phase 6 - Landing is limited to new visitors and previews the app in both languages", () => {
  const landing = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/WelcomeScreen.jsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(projectRoot, "src/components/dashboard/DashboardView.jsx"), "utf8");

  assert.ok(dashboard.includes('challenges.length === 0 && status === "unauthenticated"'), "Only unauthenticated visitors without local challenges see the landing");
  assert.ok(landing.includes('<ProgressRing'), "Landing previews the shared progress ring");
  assert.ok(landing.includes("<WeekBars"), "Landing previews the shared weekly chart");
  assert.ok(landing.includes('openModal("create")'), "Primary CTA starts a local challenge without account creation");
  assert.ok(landing.includes('openModal("auth")'), "Secondary CTA opens sign-in for sync");
  for (const key of [
    "welcomeLoginSync",
    "welcomePreview",
    "welcomePreviewLabel",
    "welcomePreviewChallenge",
    "welcomePreviewProgress",
    "welcomePreviewDays",
    "welcomeBenefits"
  ]) {
    assert.equal(typeof en[key], "string", `English landing translation exists for ${key}`);
    assert.equal(typeof ar[key], "string", `Arabic landing translation exists for ${key}`);
  }
});

test("Phase 6 - Auth modal provides localized password visibility and pending states", () => {
  const authModal = fs.readFileSync(path.join(projectRoot, "src/components/modals/AuthModal.jsx"), "utf8");
  const modal = fs.readFileSync(path.join(projectRoot, "src/components/common/Modal.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "src/styles/modals.css"), "utf8");

  assert.ok(authModal.includes('type={showPassword ? "text" : "password"}'), "Password fields can be revealed");
  assert.ok(authModal.includes('aria-pressed={showPassword}'), "Password visibility state is exposed accessibly");
  assert.ok(authModal.includes("authWorkingRegister"), "Registration has a translated pending label");
  assert.ok(authModal.includes("authWorkingLogin"), "Login has a translated pending label");
  assert.ok(authModal.includes('role="alert"'), "Authentication failures are announced");
  assert.ok(modal.includes("closeLabel = \"Close dialog\""), "Modal close action supports a localized accessible label");
  assert.ok(styles.includes(".auth-modal-dialog"), "Auth dialog has scoped glass styling");
  assert.ok(styles.includes(".auth-password-toggle:focus-visible"), "Password toggle has a visible focus state");
  for (const key of ["authLoginSubtitle", "authRegisterSubtitle", "authShowPassword", "authHidePassword"]) {
    assert.equal(typeof en[key], "string", `English auth translation exists for ${key}`);
    assert.equal(typeof ar[key], "string", `Arabic auth translation exists for ${key}`);
  }
});

test("Phase 6 - Motion stays brief, staggered, and respects reduced-motion preferences", () => {
  const styles = fs.readFileSync(path.join(projectRoot, "src/styles/components.css"), "utf8");
  const layoutStyles = fs.readFileSync(path.join(projectRoot, "src/styles/layout.css"), "utf8");
  const ring = fs.readFileSync(path.join(projectRoot, "src/components/common/ProgressRing.jsx"), "utf8");

  assert.ok(styles.includes("@keyframes phase7-enter"), "Cards have a short entrance animation");
  assert.ok(styles.includes("@keyframes phase7-ring-fill"), "Progress ring supports stroke drawing");
  assert.ok(ring.includes('"--progress-ring-circumference"'), "Ring animation uses its actual SVG circumference");
  assert.ok(styles.includes("@keyframes phase7-bar-grow"), "Weekly bars grow from their baseline");
  assert.ok(styles.includes(".challenge-card:nth-child(6) { animation-delay: 250ms; }"), "Dashboard cards use a light stagger");
  assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"), "Motion is disabled for reduced-motion users");
  assert.ok(layoutStyles.includes("@keyframes nav-indicator-enter"), "Sidebar active indicator animates on change");
  assert.ok(layoutStyles.includes("@media (prefers-reduced-motion: reduce)"), "Sidebar animation respects reduced motion");
});
