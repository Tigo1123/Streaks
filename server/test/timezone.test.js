const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidTimezone, nextMidnightInZone, timeContext, todayInZone } = require("../src/utils/timezone");
const { completionDateAllowed, challengeRangeContainsCompletions } = require("../src/routes/challenges");

test("todayInZone follows IANA calendar dates rather than UTC", () => {
  const instant = new Date("2026-01-01T12:30:00.000Z");
  assert.equal(todayInZone("UTC", instant), "2026-01-01");
  assert.equal(todayInZone("Pacific/Apia", instant), "2026-01-02");
  assert.equal(todayInZone("Pacific/Pago_Pago", new Date("2026-01-02T05:30:00.000Z")), "2026-01-01");
  assert.equal(todayInZone(null, instant), "2026-01-01");
});

test("timezone validation rejects invalid names and accepts IANA identifiers", () => {
  assert.equal(isValidTimezone("Africa/Khartoum"), true);
  assert.equal(isValidTimezone("Not/A_Zone"), false);
});

test("next midnight handles 23-hour and 25-hour daylight-saving days", () => {
  const beforeSpringMidnight = new Date("2026-03-08T05:00:00.000Z");
  const afterSpringMidnight = nextMidnightInZone("America/New_York", beforeSpringMidnight);
  assert.equal(afterSpringMidnight.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(afterSpringMidnight - beforeSpringMidnight, 23 * 60 * 60 * 1000);

  const beforeFallMidnight = new Date("2026-11-01T04:00:00.000Z");
  const afterFallMidnight = nextMidnightInZone("America/New_York", beforeFallMidnight);
  assert.equal(afterFallMidnight.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(afterFallMidnight - beforeFallMidnight, 25 * 60 * 60 * 1000);
});

test("timeContext returns authoritative date, time, and a one-second-safe rollover", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");
  assert.deepEqual(timeContext("Africa/Khartoum", now), {
    today: "2026-10-03",
    serverNow: now.toISOString(),
    nextMidnightAt: "2026-10-03T22:00:01.000Z"
  });
});

test("new completions allow today and tomorrow in the user's zone, but not later", () => {
  const challenge = { start_date: "2026-01-01", duration: 10 };
  const now = new Date("2026-01-01T12:00:00.000Z");
  assert.equal(completionDateAllowed(challenge, "2026-01-01", "UTC", now), true);
  assert.equal(completionDateAllowed(challenge, "2026-01-02", "UTC", now), true);
  assert.equal(completionDateAllowed(challenge, "2026-01-03", "UTC", now), false);
  assert.equal(completionDateAllowed(challenge, "2026-01-02", "Pacific/Apia", now), true);
});

test("existing completions are checked against challenge bounds, not the current day", () => {
  assert.equal(
    challengeRangeContainsCompletions("2026-01-01", 10, ["2026-01-04"]),
    true
  );
  assert.equal(
    challengeRangeContainsCompletions("2026-01-01", 3, ["2026-01-04"]),
    false
  );
});
