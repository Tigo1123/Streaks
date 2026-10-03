import React from "react";
import { progress, streakStats, remaining } from "../../utils/streakCalculations.js";
import { t } from "../../i18n/index.js";
import { WeekBars } from "./WeekBars.jsx";

export function StreakMetrics({ challenge, language, today }) {
  const p = progress(challenge);
  const s = streakStats(challenge, today);
  const rem = remaining(challenge);

  return (
    <section className="detail-metrics-card" aria-label={t("tracker", {}, language)}>
      <div className="detail-metrics-grid">
        <div className="metric-box">
          <span className="metric-box-val">{t("percent", { percent: p }, language)}</span>
          <span className="metric-box-lbl">{t("completion", {}, language)}</span>
        </div>

        <div className="metric-box">
          <span className="metric-box-val">{s.current}</span>
          <span className="metric-box-lbl">{t("currentStreak", {}, language)}</span>
        </div>

        <div className="metric-box">
          <span className="metric-box-val">{s.longest}</span>
          <span className="metric-box-lbl">{t("longestStreak", {}, language)}</span>
        </div>

        <div className="metric-box">
          <span className="metric-box-val">{rem}</span>
          <span className="metric-box-lbl">{t("remaining", {}, language)}</span>
        </div>
      </div>
      <div className="detail-week-summary">
        <h2 className="detail-section-heading">{t("lastSevenDays", {}, language)}</h2>
        <WeekBars challenge={challenge} language={language} today={today} />
      </div>
    </section>
  );
}
