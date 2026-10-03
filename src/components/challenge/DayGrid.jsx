import React from "react";
import { dayIndex } from "../../utils/date.js";
import { t } from "../../i18n/index.js";

export function DayGrid({ challenge, language, onToggle, today }) {
  const day = dayIndex(challenge, today);
  const totalDays = challenge.durationDays;

  const days = Array.from({ length: totalDays }, (_, i) => {
    const n = i + 1;
    const done = challenge.completedDays.includes(n);
    const future = n > day;
    const isToday = n === day;

    const label = future
      ? t("future", { day: n }, language)
      : t(done ? "markUndone" : "markDone", { day: n }, language);

    const title = t("dayOf", { day: n, total: totalDays }, language);

    return (
      <button
        key={n}
        type="button"
        className={`day-cell${done ? " done" : ""}${isToday ? " today" : ""}${future ? " future" : ""}`}
        disabled={future}
        aria-pressed={done}
        aria-label={label}
        title={title}
        onClick={() => !future && onToggle(n)}
      >
        <span className="day-cell-number">{n}</span>
        {done && <span className="day-cell-check" aria-hidden="true">✓</span>}
      </button>
    );
  });

  return (
    <div className="day-grid" role="group" aria-label={t("tracker", {}, language)}>
      {days}
    </div>
  );
}

export default DayGrid;
