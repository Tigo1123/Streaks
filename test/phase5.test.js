import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dayIndex, localToday } from "../src/utils/date.js";
import { progress, streakStats, status as getStatus, remaining } from "../src/utils/streakCalculations.js";
import { validImportChallenge, createInitialState, VERSION } from "../src/services/storage.js";

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

test("Phase 5 - CSS Design System & Zeiss Token Integrity", () => {
  const variablesCss = fs.readFileSync(path.join(projectRoot, "src/styles/variables.css"), "utf8");
  const componentsCss = fs.readFileSync(path.join(projectRoot, "src/styles/components.css"), "utf8");
  const modalsCss = fs.readFileSync(path.join(projectRoot, "src/styles/modals.css"), "utf8");

  // Verify key tokens exist in variables.css
  assert.ok(variablesCss.includes("--color-primary: #ef6f65;"), "Primary coral color preserved");
  assert.ok(variablesCss.includes("--bg-app: #f4f6f8;"), "Zeiss light dashboard gray canvas token present");
  assert.ok(variablesCss.includes("--bg-card: #ffffff;"), "Zeiss white card token present");
  assert.ok(variablesCss.includes("--sidebar-width: 250px;"), "Sidebar width defined");
  assert.ok(variablesCss.includes("--topbar-height: 64px;"), "TopNav height defined");

  // Verify components classes exist
  assert.ok(componentsCss.includes(".stat-card"), "stat-card class present");
  assert.ok(componentsCss.includes(".today-panel"), "today-panel class present");
  assert.ok(componentsCss.includes(".cards-grid"), "cards-grid class present");
  assert.ok(componentsCss.includes(".dashboard-table"), "dashboard-table class present");
  assert.ok(componentsCss.includes(".day-cell"), "day-cell class present");
  assert.ok(componentsCss.includes(".welcome-section"), "welcome-section class present");

  // Verify modals
  assert.ok(modalsCss.includes(".modal-backdrop"), "modal-backdrop present");
  assert.ok(modalsCss.includes(".modal-dialog"), "modal-dialog present");
});
