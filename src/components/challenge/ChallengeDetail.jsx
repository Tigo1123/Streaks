import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { progress as getProgress, streakStats } from "../../utils/streakCalculations.js";
import { ProgressBar } from "../common/ProgressBar.jsx";
import { DayGrid } from "./DayGrid.jsx";
import { NoteEditor } from "./NoteEditor.jsx";
import { t } from "../../i18n/index.js";
import { useTimezone } from "../../hooks/useTimezone.js";

export function ChallengeDetail() {
  const { challenges, toggleCompletion, saveNote, deleteNote, language } = useStreaks();
  const { today } = useTimezone();
  const { selectedChallengeId, goBack, openModal } = useNavigation();
  const { showToast } = useToast();

  const isRtl = language === "ar";
  const challenge = challenges.find((c) => c.id === selectedChallengeId);

  if (!challenge) {
    return (
      <div className="detail-not-found">
        <h2>{isRtl ? "التحدي غير موجود" : "Challenge Not Found"}</h2>
        <p>
          {isRtl ? "ربما تم حذف هذا التحدي أو تغير معرّفه." : "This challenge may have been deleted or the link is invalid."}
        </p>
        <button type="button" className="btn btn-primary" onClick={goBack}>
          ← {t("back", {}, language)}
        </button>
      </div>
    );
  }

  const prog = getProgress(challenge);
  const stats = streakStats(challenge, today);
  const completedCount = challenge.completedDays.length;

  const handleToggle = async (day) => {
    await toggleCompletion(challenge.id, day);
  };

  const handleSaveNote = async (text) => {
    const result = await saveNote(challenge.id, text);
    if (result.ok) showToast(t("saved", {}, language));
    return result.ok;
  };

  const handleDeleteNote = async () => {
    const result = await deleteNote(challenge.id);
    if (result.ok) showToast(isRtl ? "تم حذف الملاحظة" : "Note cleared");
    return result.ok;
  };

  return (
    <article className="detail-canvas" aria-labelledby="challengeDetailTitle">
      {/* Top Navigation & Delete */}
      <div className="detail-nav-bar">
        <button
          type="button"
          data-action="back"
          className="detail-back-pill"
          onClick={goBack}
          aria-label={t("back", {}, language)}
        >
          <span aria-hidden="true">{isRtl ? "→" : "←"}</span>
          <span>{t("back", {}, language)}</span>
        </button>

        <button
          type="button"
          className="detail-delete-btn"
          onClick={() => openModal("delete")}
          aria-label={t("delete", {}, language)}
          title={t("delete", {}, language)}
        >
          <span aria-hidden="true">🗑️</span>
          <span>{t("delete", {}, language)}</span>
        </button>
      </div>

      {/* Main Habit Header Card */}
      <header className="detail-hero-card">
        <div className="detail-hero-top">
          <div className="detail-streak-badge">
            <span aria-hidden="true">🔥</span>
            <span>{stats.current} {isRtl ? "أيام متتالية" : "day streak"}</span>
          </div>

          <div className="detail-ratio-pill">
            {completedCount} / {challenge.durationDays} {isRtl ? "أيام منجزة" : "completed"}
          </div>
        </div>

        <h1 id="challengeDetailTitle" className="detail-title">
          {challenge.name}
        </h1>

        <div className="detail-progress-zone">
          <div className="detail-progress-header">
            <span>{isRtl ? "التقدم الإجمالي" : "Overall Consistency"}</span>
            <span className="detail-progress-percent">{prog}%</span>
          </div>
          <ProgressBar value={prog} height={10} />
        </div>
      </header>

      {/* YOUR PROGRESS: Habit Calendar Grid */}
      <section className="detail-section-card" aria-labelledby="progressSectionHeading">
        <div className="detail-section-header">
          <div className="detail-section-title-wrap">
            <span className="section-icon" aria-hidden="true">📅</span>
            <h2 id="progressSectionHeading" className="detail-section-heading">
              {isRtl ? "سجل الإنجاز اليومي" : "YOUR PROGRESS"}
            </h2>
          </div>
          <span className="detail-section-hint">
            {isRtl ? "انقر على أي يوم لتسجيل إنجازه أو إلغائه" : "Tap any circle to toggle daily check-in"}
          </span>
        </div>

        <DayGrid
          challenge={challenge}
          language={language}
          onToggle={handleToggle}
          today={today}
        />
      </section>

      {/* NOTES Section: Integrated Journal */}
      <section className="detail-section-card" aria-labelledby="notesSectionHeading">
        <NoteEditor
          initialNote={challenge.note || ""}
          onSave={handleSaveNote}
          onDelete={handleDeleteNote}
          language={language}
        />
      </section>
    </article>
  );
}

export default ChallengeDetail;
