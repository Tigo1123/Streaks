import React from "react";
import { progress, streakStats, remaining } from "../../utils/streakCalculations.js";
import { t } from "../../i18n/index.js";

export function StreakMetrics({ challenge, language }) {
  const p = progress(challenge);
  const s = streakStats(challenge);
  const rem = remaining(challenge);

  return (
    <div className="detail-metrics-grid" role="group" aria-label={t("tracker", {}, language)}>
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
  );
}
