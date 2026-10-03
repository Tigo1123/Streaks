import { elapsed } from "./date.js";

/**
 * Calculates completion percentage (0 - 100).
 *
 * @param {{ completedDays: number[], durationDays: number }} challenge
 * @returns {number}
 */
export function progress(challenge) {
  if (!challenge || !challenge.durationDays || challenge.durationDays <= 0) return 0;
  return Math.round((challenge.completedDays.length / challenge.durationDays) * 100);
}

/**
 * Calculates current streak and longest streak.
 * - Longest streak is the maximum consecutive run of completed days across the entire duration.
 * - Current streak counts backwards from today (or yesterday if today is not yet completed).
 *
 * @param {{ completedDays: number[], durationDays: number, startDate: string }} challenge
 * @param {string} [todayStr]
 * @returns {{ current: number, longest: number }}
 */
export function streakStats(challenge, todayStr) {
  const done = new Set(challenge.completedDays);
  const today = elapsed(challenge, todayStr);
  let longest = 0;
  let run = 0;

  for (let n = 1; n <= challenge.durationDays; n++) {
    run = done.has(n) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  let current = 0;
  let n = Math.min(today, challenge.durationDays);

  if (n > 0 && !done.has(n)) {
    n--;
  }

  while (n > 0 && done.has(n)) {
    current++;
    n--;
  }

  return { current, longest };
}

/**
 * Computes the challenge status:
 * - "completed": All days in duration are done (100% progress).
 * - "missed": Any elapsed day prior to today (or today) was not completed.
 * - "active": All elapsed days so far are completed.
 *
 * @param {{ completedDays: number[], durationDays: number, startDate: string }} challenge
 * @param {string} [todayStr]
 * @returns {"completed" | "missed" | "active"}
 */
export function status(challenge, todayStr) {
  if (progress(challenge) === 100) return "completed";
  const el = elapsed(challenge, todayStr);
  if (el > 0) {
    const hasIncomplete = Array.from({ length: el }, (_, i) => i + 1).some((n) => !challenge.completedDays.includes(n));
    if (hasIncomplete) return "missed";
  }
  return "active";
}

/**
 * Calculates the number of remaining incomplete days in the challenge.
 *
 * @param {{ completedDays: number[], durationDays: number }} challenge
 * @returns {number}
 */
export function remaining(challenge) {
  if (!challenge || !challenge.durationDays) return 0;
  return Math.max(0, challenge.durationDays - challenge.completedDays.length);
}
