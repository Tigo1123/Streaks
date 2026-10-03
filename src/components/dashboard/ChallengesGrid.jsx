import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { dayIndex } from "../../utils/date.js";
import { progress, status as getStatus, streakStats } from "../../utils/streakCalculations.js";
import { ProgressBar } from "../common/ProgressBar.jsx";
import { t } from "../../i18n/index.js";

export function ChallengesGrid() {
  const { challenges, language } = useStreaks();
  const { openChallenge } = useNavigation();

  const isRtl = language === "ar";

  return (
    <section className="cards-grid" aria-label={t("challengeCount", { count: challenges.length }, language)}>
      {challenges.map((c) => {
        const p = progress(c);
        const s = getStatus(c);
        const d = dayIndex(c);
        const stats = streakStats(c);

        const isDoneToday = d >= 1 && d <= c.durationDays && c.completedDays.includes(d);
        const isCompletedChallenge = p === 100;
        const isFuture = d < 1;

        let stateClass = "state-in-progress";
        let stateBadge = null;

        if (isCompletedChallenge) {
          stateClass = "state-completed";
          stateBadge = <span className="card-state-pill pill-gold">🏆 {isRtl ? "مكتمل!" : "Completed!"}</span>;
        } else if (isDoneToday) {
          stateClass = "state-done-today";
          stateBadge = <span className="card-state-pill pill-green">✓ {isRtl ? "منجز اليوم" : "Done today"}</span>;
        } else if (isFuture) {
          stateClass = "state-future";
          stateBadge = <span className="card-state-pill pill-future">⏳ {isRtl ? `يبدأ بعد ${1 - d} أيام` : `Starts in ${1 - d}d`}</span>;
        }

        const dayText = isFuture
          ? (isRtl ? `تحدٍ قادم (${c.durationDays} يوم)` : `Upcoming (${c.durationDays} days)`)
          : `${isRtl ? "اليوم" : "Day"} ${Math.min(Math.max(1, d), c.durationDays)} / ${c.durationDays}`;

        const handleKeyDown = (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            openChallenge(c.id);
          }
        };

        return (
          <article
            key={c.id}
            id={`challenge-card-${c.id}`}
            data-open={c.id}
            data-action="open-challenge"
            className={`challenge-card ${stateClass}`}
            tabIndex={0}
            role="button"
            onClick={() => openChallenge(c.id)}
            onKeyDown={handleKeyDown}
            aria-label={`${c.name}, ${p}% completed, ${stats.current} day streak`}
          >
            {/* Top: Streak & State Badge */}
            <div className="challenge-card-top-row">
              <div className="card-streak-pill">
                <span aria-hidden="true">🔥</span>
                <span className="streak-pill-text">{stats.current} {isRtl ? "أيام متتالية" : "day streak"}</span>
              </div>
              {stateBadge}
            </div>

            {/* Middle: Title Dominates */}
            <h3 className="challenge-card-title">{c.name}</h3>

            {/* Progress Bar & Percentage */}
            <div className="challenge-card-progress-zone">
              <div className="progress-label-row">
                <span className="progress-tag">{isRtl ? "التقدم" : "Progress"}</span>
                <span className="progress-number">{p}%</span>
              </div>
              <ProgressBar value={p} height={8} />
            </div>

            {/* Bottom: Day Count & Continue Action */}
            <div className="challenge-card-footer">
              <span className="card-day-counter">{dayText}</span>
              <span className="card-continue-btn" aria-hidden="true">
                {isRtl ? "متابعة ←" : "Continue →"}
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default ChallengesGrid;
