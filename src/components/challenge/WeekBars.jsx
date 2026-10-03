import React from "react";
import { dayIndex } from "../../utils/date.js";
import { t } from "../../i18n/index.js";

function FlameIcon() {
  return (
    <svg viewBox="0 0 16 18" aria-hidden="true" focusable="false">
      <path
        d="M8.2 1.2c.3 2.8-1.1 3.9-2.3 5.1C4.7 7.6 4 8.6 4 10.2a4 4 0 0 0 8 0c0-1.9-1.1-3.4-2.3-4.7.1 1.5-.3 2.2-1 2.7.3-2.8-.4-5.1-.5-7Z"
        fill="currentColor"
      />
      <path d="M8.3 10.2c.1 1.1-.8 1.4-.8 2.3a1.4 1.4 0 0 0 2.8 0c0-.7-.5-1.2-1-1.8 0 .6-.4.9-1 .9Z" fill="var(--color-bg-mid)" />
    </svg>
  );
}

export function WeekBars({ challenge, language, today }) {
  const currentDay = Math.min(dayIndex(challenge, today), challenge.durationDays);
  const firstDay = currentDay - 6;
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = firstDay + index;
    const inChallenge = day >= 1 && day <= challenge.durationDays;
    const completed = inChallenge && challenge.completedDays.includes(day);
    const isFuture = day > currentDay;
    const isBeforeStart = day < 1;
    return { day, completed, isFuture, isBeforeStart };
  });
  const completedCount = days.filter((item) => item.completed).length;

  return (
    <div
      className="week-bars"
      role="img"
      aria-label={t("weekBarsDescription", { completed: completedCount, total: days.length }, language)}
    >
      <div className="week-bars-columns" aria-hidden="true">
        {days.map(({ day, completed, isFuture, isBeforeStart }) => {
          const stateClass = isBeforeStart
            ? "before-start"
            : completed
              ? "completed"
              : isFuture
                ? "upcoming"
                : "missed";

          return (
            <div className={`week-bar-column ${stateClass}`} key={day}>
              <div className="week-bar-visual">
                {completed && <span className="week-bar-flame"><FlameIcon /></span>}
                <span className="week-bar-track">
                  <span className="week-bar-fill" />
                </span>
              </div>
              <span className="week-bar-label">{isBeforeStart ? "—" : day}</span>
            </div>
          );
        })}
      </div>
      <span className="visually-hidden">
        {t("weekBarsDescription", { completed: completedCount, total: days.length }, language)}
      </span>
    </div>
  );
}

export default WeekBars;
