import { dayIndex } from "./date.js";

export function completionDistribution(challenges, today) {
  let completed = 0;
  let missed = 0;

  for (const challenge of challenges) {
    const dueDays = Math.min(
      challenge.durationDays,
      Math.max(0, dayIndex(challenge, today))
    );
    const completedDueDays = challenge.completedDays.filter(
      (day) => day >= 1 && day <= dueDays
    ).length;

    completed += completedDueDays;
    missed += dueDays - completedDueDays;
  }

  const due = completed + missed;

  return {
    completed,
    missed,
    due,
    completedPercent: due > 0 ? Math.round((completed / due) * 100) : 0,
    missedPercent: due > 0 ? Math.round((missed / due) * 100) : 0
  };
}
