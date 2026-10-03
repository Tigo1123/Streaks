import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useTimezone } from "../../hooks/useTimezone.js";
import { migrationDate } from "../../utils/date.js";
import { ProgressRing } from "../common/ProgressRing.jsx";
import { WeekBars } from "../challenge/WeekBars.jsx";
import { t } from "../../i18n/index.js";

export function WelcomeScreen() {
  const { language } = useStreaks();
  const { openModal } = useNavigation();
  const { today } = useTimezone();

  const previewChallenge = {
    startDate: migrationDate(today, -22),
    durationDays: 30,
    completedDays: [18, 19, 20, 21, 22, 23, 24]
  };

  return (
    <section className="welcome-section landing-page" aria-labelledby="welcomeHeroTitle">
      <header className="landing-header">
        <div className="welcome-brand-badge">
          <span className="welcome-flame" aria-hidden="true">🔥</span>
          <span>{t("welcomeTitle", {}, language)}</span>
        </div>
        <p className="landing-kicker">{t("welcomeSimple", {}, language)}</p>
      </header>

      <div className="landing-hero">
        <div className="landing-copy">
          <h1 id="welcomeHeroTitle" className="welcome-hero-headline">
            {t("welcomeLead", {}, language)}
          </h1>
          <p className="welcome-hero-subline">{t("welcomeCopy", {}, language)}</p>
          <div className="welcome-cta-group">
            <button
              type="button"
              className="btn btn-primary welcome-main-cta"
              onClick={() => openModal("create")}
            >
              <span aria-hidden="true">✦</span>
              <span>{t("welcomeCreate", {}, language)}</span>
            </button>
            <button
              type="button"
              className="landing-login-link"
              onClick={() => openModal("auth")}
            >
              {t("welcomeLoginSync", {}, language)}
            </button>
          </div>
        </div>

        <section className="landing-preview" aria-label={t("welcomePreview", {}, language)}>
          <div className="landing-preview-header">
            <div>
              <span className="landing-preview-eyebrow">{t("welcomePreviewLabel", {}, language)}</span>
              <h2>{t("welcomePreviewChallenge", {}, language)}</h2>
            </div>
            <span className="landing-preview-streak">
              <span aria-hidden="true">🔥</span> 24
            </span>
          </div>
          <div className="landing-preview-progress">
            <ProgressRing
              value={80}
              label={t("progress", {}, language)}
              size={104}
              className="progress-ring-hero"
            />
            <div>
              <strong>{t("welcomePreviewProgress", {}, language)}</strong>
              <p>{t("welcomePreviewDays", {}, language)}</p>
            </div>
          </div>
          <div className="landing-preview-chart">
            <WeekBars challenge={previewChallenge} language={language} today={today} />
          </div>
        </section>
      </div>

      <ul className="landing-features" aria-label={t("welcomeBenefits", {}, language)}>
        <li className="landing-feature-card">
          <span className="landing-feature-icon" aria-hidden="true">✦</span>
          <div>
            <h2>{t("welcomeFeatureCreate", {}, language)}</h2>
            <p>{t("welcomeFeatureCreateText", {}, language)}</p>
          </div>
        </li>
        <li className="landing-feature-card">
          <span className="landing-feature-icon" aria-hidden="true">▦</span>
          <div>
            <h2>{t("welcomeFeatureTrack", {}, language)}</h2>
            <p>{t("welcomeFeatureTrackText", {}, language)}</p>
          </div>
        </li>
        <li className="landing-feature-card">
          <span className="landing-feature-icon" aria-hidden="true">↗</span>
          <div>
            <h2>{t("welcomeFeatureStreak", {}, language)}</h2>
            <p>{t("welcomeFeatureStreakText", {}, language)}</p>
          </div>
        </li>
      </ul>

      <p className="landing-privacy-note">{t("welcomePrivacy", {}, language)}</p>
    </section>
  );
}

export default WelcomeScreen;
