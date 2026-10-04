import React, { useEffect, useRef } from "react";
import { Shell } from "./components/layout/Shell.jsx";
import { DashboardView } from "./components/dashboard/DashboardView.jsx";
import { ChallengeDetail } from "./components/challenge/ChallengeDetail.jsx";
import { CreateChallengeModal } from "./components/modals/CreateChallengeModal.jsx";
import { DeleteChallengeModal } from "./components/modals/DeleteChallengeModal.jsx";
import { AuthModal } from "./components/modals/AuthModal.jsx";
import { BackupModal } from "./components/modals/BackupModal.jsx";
import { SyncConflictModal } from "./components/modals/SyncConflictModal.jsx";
import { SyncOnboardingModal } from "./components/modals/SyncOnboardingModal.jsx";
import { ImportExportModal } from "./components/modals/ImportExportModal.jsx";
import { TimezoneModal } from "./components/modals/TimezoneModal.jsx";
import { StorageRecoveryScreen } from "./components/common/StorageRecoveryScreen.jsx";
import { useStreaks } from "./hooks/useStreaks.js";
import { useNavigation } from "./hooks/useNavigation.js";
import { useToast } from "./hooks/useToast.js";
import { t } from "./i18n/index.js";

export function App() {
  const { language, setLanguage, loadError, quarantinedCount, rawStorageData } = useStreaks();
  const { currentScreen, openModal } = useNavigation();
  const { showToast } = useToast();
  const warnedRawRef = useRef(null);

  // Keep <html> dir and lang attributes in sync
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    if (quarantinedCount > 0 && warnedRawRef.current !== rawStorageData) {
      warnedRawRef.current = rawStorageData;
      showToast(t("quarantinedWarning", { count: quarantinedCount }, language), "alert", 0);
    }
  }, [quarantinedCount, rawStorageData, language, showToast]);

  if (loadError) return <StorageRecoveryScreen />;

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "ar" : "en");
  };

  return (
    <>
      <Shell
        language={language}
        onToggleLanguage={toggleLanguage}
        onNewChallenge={() => openModal("create")}
      >
        {currentScreen === "detail" ? <ChallengeDetail /> : <DashboardView />}
      </Shell>

      {/* Accessible Modals */}
      <CreateChallengeModal />
      <DeleteChallengeModal />
      <AuthModal />
      <BackupModal />
      <SyncConflictModal />
      <SyncOnboardingModal />
      <ImportExportModal />
      <TimezoneModal />
    </>
  );
}
