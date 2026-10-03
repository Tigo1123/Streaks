import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useAuth } from "../../hooks/useAuth.js";
import { t } from "../../i18n/index.js";

export function WelcomeScreen() {
  const { language } = useStreaks();
  const { openModal } = useNavigation();
  const { isAuthenticated } = useAuth();

  const isRtl = language === "ar";

  return (
    <section className="welcome-section" aria-labelledby="welcomeHeroTitle">
      {/* Brand Pill */}
      <div className="welcome-brand-badge">
        <span className="welcome-flame" aria-hidden="true">🔥</span>
        <span>STREAKS</span>
      </div>

      {/* Main Copy */}
      <h1 id="welcomeHeroTitle" className="welcome-hero-headline">
        {isRtl ? "ابنِ عادات تدوم." : "Build habits that stick."}
      </h1>

      <p className="welcome-hero-subline">
        {isRtl
          ? "خطوات يومية صغيرة. زخم وتغيير كبير."
          : "Small daily actions. Big momentum."}
      </p>

      {/* Dual CTA Actions */}
      <div className="welcome-cta-group">
        <button
          type="button"
          className="btn btn-primary welcome-main-cta"
          onClick={() => openModal("create")}
        >
          <span aria-hidden="true" style={{ fontSize: "1.1rem" }}>⚡</span>
          <span>{isRtl ? "ابدأ أول سلسلة" : "Start a streak"}</span>
        </button>

        {!isAuthenticated && (
          <button
            type="button"
            className="btn btn-secondary welcome-secondary-cta"
            onClick={() => openModal("auth")}
          >
            <span>{isRtl ? "تسجيل الدخول" : "Sign in"}</span>
          </button>
        )}
      </div>

      {/* Engaging Visual Hero Around Streaks Concept */}
      <div className="welcome-interactive-stage" aria-hidden="true">
        {/* Ambient Gradient Background Glow */}
        <div className="welcome-ambient-glow" />

        {/* Floating Accent Card 1 (Top Left) */}
        <div className="welcome-floating-card float-left">
          <div className="floating-card-icon">📚</div>
          <div className="floating-card-content">
            <span className="floating-card-title">{isRtl ? "قراءة 20 صفحة" : "Read 20 pages"}</span>
            <span className="floating-card-streak">🔥 12 {isRtl ? "يوم" : "days"}</span>
          </div>
          <div className="floating-card-check">✓</div>
        </div>

        {/* Main Central Interactive Showcase Card */}
        <div className="welcome-showcase-card">
          <div className="showcase-card-header">
            <div className="showcase-habit-tag">
              <span className="showcase-habit-emoji">🏃</span>
              <div>
                <span className="showcase-habit-title">{isRtl ? "الركض الصباحي" : "Morning Run"}</span>
                <span className="showcase-habit-sub">{isRtl ? "اليوم 24 من 30" : "Day 24 of 30"}</span>
              </div>
            </div>
            <div className="showcase-streak-pill">
              🔥 24 {isRtl ? "يوم متواصل" : "day streak"}
            </div>
          </div>

          <div className="showcase-progress-wrap">
            <div className="showcase-progress-labels">
              <span>{isRtl ? "الالتزام الشهري" : "Monthly Momentum"}</span>
              <span className="showcase-percent">80%</span>
            </div>
            <div className="showcase-progress-bar">
              <div className="showcase-progress-fill" style={{ width: "80%" }} />
            </div>
          </div>

          <div className="showcase-checkin-banner">
            <div className="showcase-check-circle">✓</div>
            <span>{isRtl ? "تم إنجاز تحدي اليوم! حافظ على استمرارك." : "Completed for today! Keep the chain unbroken."}</span>
          </div>
        </div>

        {/* Floating Accent Card 2 (Bottom Right) */}
        <div className="welcome-floating-card float-right">
          <div className="floating-card-icon">🧘</div>
          <div className="floating-card-content">
            <span className="floating-card-title">{isRtl ? "تأمل وهدوء" : "Mindfulness"}</span>
            <span className="floating-card-streak">✨ 96% {isRtl ? "التزام" : "consistency"}</span>
          </div>
          <div className="floating-card-star">★</div>
        </div>
      </div>

      {/* Reassurance Footer */}
      <p className="welcome-privacy-note">
        🔒 {isRtl ? "خاص وافتراضي على جهازك. يعمل بلا إنترنت ومزامنة سحابية اختيارية." : "Private by default. Offline-ready. Optional cloud sync."}
      </p>
    </section>
  );
}

export default WelcomeScreen;
