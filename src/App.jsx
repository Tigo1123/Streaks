import React, { useEffect } from "react";
import { Shell } from "./components/layout/Shell.jsx";
import { DashboardView } from "./components/dashboard/DashboardView.jsx";
import { ChallengeDetail } from "./components/challenge/ChallengeDetail.jsx";
import { CreateChallengeModal } from "./components/modals/CreateChallengeModal.jsx";
import { DeleteChallengeModal } from "./components/modals/DeleteChallengeModal.jsx";
import { AuthModal } from "./components/modals/AuthModal.jsx";
import { BackupModal } from "./components/modals/BackupModal.jsx";
import { SyncConflictModal } from "./components/modals/SyncConflictModal.jsx";
import { ImportExportModal } from "./components/modals/ImportExportModal.jsx";
import { useStreaks } from "./hooks/useStreaks.js";
import { useNavigation } from "./hooks/useNavigation.js";

export function App() {
  const { language, setLanguage } = useStreaks();
  const { currentScreen, openModal } = useNavigation();

  // Keep <html> dir and lang attributes in sync
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

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
      <ImportExportModal />
    </>
  );
}
