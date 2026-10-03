import test from "node:test";
import assert from "node:assert/strict";
import { localToday, nextMidnightInZone, scheduleTodayRollover } from "../src/utils/date.js";

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
