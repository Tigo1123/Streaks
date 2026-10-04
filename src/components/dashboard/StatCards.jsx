import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { status as getStatus, streakStats } from "../../utils/streakCalculations.js";
import { dayIndex } from "../../utils/date.js";
import { t } from "../../i18n/index.js";
import { useTimezone } from "../../hooks/useTimezone.js";
import { ProgressRing } from "../common/ProgressRing.jsx";
import { completionDistribution } from "../../utils/statistics.js";
import { DistributionCard } from "./DistributionCard.jsx";
import { LineIcon } from "../common/LineIcon.jsx";

export function StatCards() {
  const { challenges, language } = useStreaks();
  const { today } = useTimezone();
  const isRtl = language === "ar";

  let activeCount = 0;
  let totalCompletedDays = 0;
  let totalChallengeDays = 0;
  let bestStreak = 0;
  let currentTopStreak = 0;
  let todayDueCount = 0;
  let todayDoneCount = 0;

  for (const c of challenges) {
    const s = getStatus(c, today);
    if (s === "active") activeCount++;
    totalCompletedDays += c.completedDays.length;
    totalChallengeDays += c.durationDays;

    const stats = streakStats(c, today);
    if (stats.longest > bestStreak) {
      bestStreak = stats.longest;
    }
    if (stats.current > currentTopStreak) {
      currentTopStreak = stats.current;
    }

    const d = dayIndex(c, today);
    if (d >= 1 && d <= c.durationDays) {
      todayDueCount++;
      if (c.completedDays.includes(d)) {
        todayDoneCount++;
      }
    }
  }

  const completionRate = totalChallengeDays > 0
    ? Math.round((totalCompletedDays / totalChallengeDays) * 100)
    : 0;

  const todayPercent = todayDueCount > 0 ? Math.round((todayDoneCount / todayDueCount) * 100) : 0;
  const distribution = completionDistribution(challenges, today);

  return (
    <section className="momentum-overview-container" aria-label={isRtl ? "ملخص الزخم والسلاسل" : "Momentum Overview"}>
      <article className="stat-card momentum-hero-card">
        <div className="momentum-card-left">
          <div className="momentum-header-tag">
            <span className="momentum-tag-label">{isRtl ? "سلسلة الإنجاز الحالية" : "CURRENT STREAK"}</span>
            <span className="momentum-best-badge">
              ★ {isRtl ? `الأفضل: ${bestStreak} يوم` : `Best: ${bestStreak} days`}
            </span>
          </div>

          <div className="momentum-streak-number-row">
            <span className="momentum-huge-number">{currentTopStreak}</span>
            <div className="momentum-number-meta">
              <span className="momentum-unit-text">{isRtl ? "أيام متتالية" : "days active"}</span>
              <span className="momentum-encouragement">
                {currentTopStreak > 0
                  ? (isRtl ? "زخم رائع! واصل التقدم اليوم." : "Small actions. Big momentum.")
                  : (isRtl ? "سجّل إنجاز اليوم لتبدأ سلسلتك!" : "Check in today to ignite your streak!")}
              </span>
            </div>
          </div>
        </div>

        <div className="momentum-pods-row">
          <div className="momentum-pod momentum-today-pod">
            <ProgressRing
              value={todayPercent}
              label={isRtl ? "إنجاز اليوم" : "Today's completion"}
              size={116}
              className="progress-ring-hero"
            />
            <div className="pod-text-wrap">
              <span className="pod-value">{todayDueCount > 0 ? `${todayDoneCount}/${todayDueCount}` : "0"}</span>
              <span className="pod-label">{isRtl ? "مهام اليوم" : "Today"}</span>
            </div>
          </div>

          <div className="momentum-pod">
            <div className="pod-badge-avatar"><LineIcon name="target" /></div>
            <div className="pod-text-wrap">
              <span className="pod-value">{activeCount}</span>
              <span className="pod-label">{isRtl ? "تحديات نشطة" : "Active"}</span>
            </div>
          </div>

          <div className="momentum-pod">
            <div className="pod-badge-avatar"><LineIcon name="chart" /></div>
            <div className="pod-text-wrap">
              <span className="pod-value">{completionRate}%</span>
              <span className="pod-label">{isRtl ? "معدل الالتزام" : "Consistency"}</span>
            </div>
          </div>
        </div>
      </article>
      <DistributionCard distribution={distribution} language={language} />
    </section>
  );
}

export default StatCards;
