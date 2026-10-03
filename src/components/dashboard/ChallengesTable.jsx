import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { dayIndex } from "../../utils/date.js";
import { progress, status as getStatus, streakStats } from "../../utils/streakCalculations.js";
import { Badge } from "../common/Badge.jsx";
import { ProgressRing } from "../common/ProgressRing.jsx";
import { t } from "../../i18n/index.js";
import { useTimezone } from "../../hooks/useTimezone.js";

export function ChallengesTable() {
  const { challenges, language } = useStreaks();
  const { today } = useTimezone();
  const { goToDetail } = useNavigation();

  const isRtl = language === "ar";

  return (
    <div className="table-container" aria-label={t("challengeCount", { count: challenges.length }, language)}>
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>{t("name", {}, language)}</th>
            <th>{isRtl ? "الحالة" : "Status"}</th>
            <th style={{ minWidth: "160px" }}>{t("progress", {}, language)}</th>
            <th>{t("currentStreak", {}, language)}</th>
            <th>{t("startDate", {}, language)}</th>
            <th style={{ textAlign: isRtl ? "left" : "right" }}>{isRtl ? "إجراء" : "Action"}</th>
          </tr>
        </thead>
        <tbody>
          {challenges.map((c) => {
            const p = progress(c);
            const s = getStatus(c, today);
            const d = dayIndex(c, today);
            const stats = streakStats(c, today);

            const dayText = d < 1
              ? t("startFuture", { count: 1 - d }, language)
              : t("dayOf", { day: Math.min(d, c.durationDays), total: c.durationDays }, language);

            return (
              <tr key={c.id}>
                <td>
                  <strong
                    style={{ cursor: "pointer", color: "var(--text-primary)" }}
                    onClick={() => goToDetail(c.id)}
                  >
                    {c.name}
                  </strong>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {dayText}
                  </div>
                </td>
                <td>
                  <Badge status={s} />
                </td>
                <td>
                  <ProgressRing
                    value={p}
                    label={isRtl ? `تقدم ${c.name}` : `${c.name} progress`}
                    size={48}
                    className="progress-ring-table"
                  />
                </td>
                <td>
                  <span style={{ fontWeight: 600 }}>🔥 {stats.current}</span>
                </td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {c.startDate}
                </td>
                <td style={{ textAlign: isRtl ? "left" : "right" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => goToDetail(c.id)}
                    style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "30px" }}
                  >
                    {t("tracker", {}, language)}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
