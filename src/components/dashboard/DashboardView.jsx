import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useAuth } from "../../hooks/useAuth.js";
import { StatCards } from "./StatCards.jsx";
import { TodayActionPanel } from "./TodayActionPanel.jsx";
import { ChallengesGrid } from "./ChallengesGrid.jsx";
import { WelcomeScreen } from "./WelcomeScreen.jsx";
import { t } from "../../i18n/index.js";
import { useNavigation } from "../../hooks/useNavigation.js";

function getGreeting(language) {
  const hour = new Date().getHours();
  const isRtl = language === "ar";
  if (hour < 12) {
    return isRtl ? "صباح الخير" : "Good morning";
  }
  if (hour < 18) {
    return isRtl ? "مساء الخير" : "Good afternoon";
  }
  return isRtl ? "مساء الخير" : "Good evening";
}

export function DashboardView() {
  const { challenges, language, localDisplayName } = useStreaks();
  const { user, isAuthenticated, status } = useAuth();
  const { openModal } = useNavigation();

  const isRtl = language === "ar";

  if (challenges.length === 0 && status === "unauthenticated") {
    return <WelcomeScreen />;
  }

  if (challenges.length === 0) {
    return (
      <section className="empty-dashboard" aria-labelledby="emptyDashboardTitle">
        <h1 id="emptyDashboardTitle">{t("emptyTitle", {}, language)}</h1>
        <p>{t("emptyText", {}, language)}</p>
        <button type="button" className="btn btn-primary" onClick={() => openModal("create")}>
          {t("create", {}, language)}
        </button>
      </section>
    );
  }

  const baseGreeting = getGreeting(language);
  const displayName = isAuthenticated ? user?.displayName || "" : localDisplayName;
  const firstName = displayName ? displayName.trim().split(/\s+/)[0] : "";
  const greetingText = firstName
    ? `${baseGreeting}, ${firstName}`
    : baseGreeting;

  return (
    <div className="dashboard-canvas">
      {/* Header - Large, Confident & Personal */}
      <header className="dashboard-header">
        <div className="dashboard-header-text">
          <h1 className="dashboard-greeting">{greetingText}</h1>
          <p className="dashboard-subheading">
            {isRtl ? "واصل بناء عاداتك خطوة بخطوة." : "Keep your momentum going."}
          </p>
        </div>
      </header>

      {/* Hero Metric + Secondary Metrics */}
      <StatCards />

      {/* Today's Focus Centerpiece */}
      <TodayActionPanel />

      {/* Your Challenges Section */}
      <section id="challenges-section" className="dashboard-section" aria-labelledby="challengesSectionTitle">
        <div className="dashboard-section-header">
          <h2 id="challengesSectionTitle" className="dashboard-section-title">
            {isRtl ? "التحديات" : "Your Challenges"}
          </h2>
          <span className="dashboard-section-count">
            {t("challengeCount", { count: challenges.length }, language)}
          </span>
        </div>

        <ChallengesGrid />
      </section>
    </div>
  );
}

export default DashboardView;
