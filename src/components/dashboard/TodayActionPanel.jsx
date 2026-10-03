import React, { useState } from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { dayIndex } from "../../utils/date.js";
import { progress, streakStats } from "../../utils/streakCalculations.js";
import { t } from "../../i18n/index.js";

export function TodayActionPanel() {
  const { challenges, toggleCompletion, language } = useStreaks();
  const { openChallenge } = useNavigation();

  // State to trigger momentary celebration animation when a challenge is checked
  const [justCelebratedId, setJustCelebratedId] = useState(null);

  const isRtl = language === "ar";

  const todayChallenges = challenges
    .map((c) => {
      const day = dayIndex(c);
      const isDueToday = day >= 1 && day <= c.durationDays;
      const isDoneToday = isDueToday && c.completedDays.includes(day);
      const prog = progress(c);
      const stats = streakStats(c);
      return {
        challenge: c,
        day,
        isDueToday,
        isDoneToday,
        progress: prog,
        streak: stats.current,
      };
    })
    .filter((item) => item.isDueToday);

  if (todayChallenges.length === 0) {
    return null;
  }

  const completedCount = todayChallenges.filter((item) => item.isDoneToday).length;
  const allCompleted = completedCount === todayChallenges.length;

  const handleCheckIn = (challengeId, day, wasDone) => {
    const result = toggleCompletion(challengeId, day);
    if (!result.ok) return;
    if (!wasDone) {
      setJustCelebratedId(challengeId);
      setTimeout(() => setJustCelebratedId(null), 1200);
    }
  };

  return (
    <section className="today-panel" aria-labelledby="todayPanelTitle">
      {/* Section Header */}
      <div className="today-panel-header">
        <div className="today-title-cluster">
          <div className="today-bolt-avatar" aria-hidden="true">⚡</div>
          <div>
            <h2 id="todayPanelTitle" className="today-panel-heading">
              {isRtl ? "مهام اليوم" : "Today's Focus"}
            </h2>
            <p className="today-panel-subline">
              {allCompleted
                ? (isRtl ? "جميع العادات مكتملة اليوم! أنت رائع ✨" : "All habits completed today! You crushed it ✨")
                : (isRtl ? "أكمل خطواتك اليومية للحفاظ على استمرارك." : "Complete your daily actions to protect your streak.")}
            </p>
          </div>
        </div>

        <div className="today-completion-badge">
          <span className="badge-count">{completedCount}/{todayChallenges.length}</span>
          <span className="badge-text">{isRtl ? "مكتمل" : "done"}</span>
        </div>
      </div>

      {/* Grand Celebration Banner if All Complete */}
      {allCompleted && (
        <div className="today-celebration-banner" role="status">
          <span className="celebration-sparkles" aria-hidden="true">🎉✨</span>
          <div className="celebration-text">
            <strong>{isRtl ? "تم إنجاز كافة تحديات اليوم!" : "All challenges completed for today!"}</strong>
            <span>{isRtl ? "سلسلتك متوهجة وزخمك في القمة. نراك غداً!" : "Your streak is on fire. Rest up and keep it going tomorrow!"}</span>
          </div>
          <span className="celebration-flame-badge">🔥 100%</span>
        </div>
      )}

      {/* Activity Habit Rows */}
      <div className="today-items-list" role="list">
        {todayChallenges.map(({ challenge, day, isDoneToday, progress: prog, streak }) => {
          const isCelebrated = justCelebratedId === challenge.id;

          return (
            <div
              key={challenge.id}
              className={`today-item ${isDoneToday ? "completed" : ""} ${isCelebrated ? "celebrating" : ""}`}
              role="listitem"
            >
              {/* Confetti Micro-particles for Celebration */}
              {isCelebrated && (
                <div className="confetti-burst-container" aria-hidden="true">
                  <span className="confetti-particle p1">✨</span>
                  <span className="confetti-particle p2">🎉</span>
                  <span className="confetti-particle p3">⭐</span>
                  <span className="confetti-particle p4">🔥</span>
                </div>
              )}

              {/* Bouncy Interactive Check-in Button */}
              <button
                type="button"
                className={`today-checkin-btn ${isDoneToday ? "checked" : ""}`}
                onClick={() => handleCheckIn(challenge.id, day, isDoneToday)}
                aria-pressed={isDoneToday}
                aria-label={t(isDoneToday ? "markUndone" : "markDone", { day }, language)}
                title={t(isDoneToday ? "markUndone" : "markDone", { day }, language)}
              >
                <span className="today-checkin-icon" aria-hidden="true">✓</span>
              </button>

              {/* Central Information */}
              <div
                className="today-item-main"
                onClick={() => openChallenge(challenge.id)}
                style={{ cursor: "pointer" }}
                data-action="open-challenge"
                data-open={challenge.id}
              >
                <div className="today-item-header">
                  <button
                    type="button"
                    className="today-item-title-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      openChallenge(challenge.id);
                    }}
                  >
                    {challenge.name}
                  </button>
                  <span className="today-streak-chip">
                    🔥 {streak} {isRtl ? "يوم" : "d"}
                  </span>
                </div>

                <div className="today-item-subline">
                  <span className="today-item-day">
                    {t("dayOf", { day, total: challenge.durationDays }, language)}
                  </span>
                  <span className="today-item-progress-val">{prog}%</span>
                </div>

                {/* Animated Rounded Gradient Progress Bar */}
                <div
                  className="today-item-progress-track"
                  role="progressbar"
                  aria-valuenow={prog}
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div
                    className="today-item-progress-fill"
                    style={{ width: `${prog}%` }}
                  />
                </div>
              </div>

              {/* Right Action Trigger */}
              <div className="today-item-action-wrap">
                <button
                  type="button"
                  className={`today-action-btn ${isDoneToday ? "done" : "due"}`}
                  onClick={() => handleCheckIn(challenge.id, day, isDoneToday)}
                >
                  {isDoneToday
                    ? (isRtl ? "منجز ✓" : "Done ✓")
                    : (isRtl ? "تسجيل الإنجاز" : "Check in →")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TodayActionPanel;
