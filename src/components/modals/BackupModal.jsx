import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { readMigrationSource, migrateLocalData } from "../../services/cloudBackup.js";
import { ProgressBar } from "../common/ProgressBar.jsx";
import { t } from "../../i18n/index.js";

export function BackupModal() {
  const { user, token } = useAuth();
  const { language } = useStreaks();
  const { modalMode, closeModal } = useNavigation();
  const { showToast } = useToast();

  const [step, setStep] = useState("confirm"); // "confirm" | "progress" | "result"
  const [counts, setCounts] = useState({ challenges: 0, completions: 0, notes: 0 });
  const [progressState, setProgressState] = useState(null);
  const [resultState, setResultState] = useState(null);

  const isOpen = modalMode === "backup";
  const isRtl = language === "ar";

  useEffect(() => {
    if (isOpen) {
      try {
        const { counts: c } = readMigrationSource();
        setCounts(c);
        setStep("confirm");
        setProgressState(null);
        setResultState(null);
      } catch (err) {
        setCounts({ challenges: 0, completions: 0, notes: 0 });
        setStep("confirm");
      }
    }
  }, [isOpen]);

  const handleStartBackup = async () => {
    if (!token || !user) return;
    setStep("progress");

    const res = await migrateLocalData({
      token,
      userId: user.id,
      onProgress: (p) => {
        setProgressState({ ...p });
      },
    });

    setResultState(res);
    setStep("result");
    if (res.resultKey === "cloudComplete") {
      showToast(isRtl ? "اكتملت النسخة السحابية بنجاح" : "Cloud backup complete!");
    }
  };

  let title = t("cloudConfirmTitle", {}, language);
  let content = null;
  let footer = null;

  if (step === "confirm") {
    title = t("cloudConfirmTitle", {}, language);
    content = (
      <div className="modal-content-stack">
        <p className="modal-body-text">
          {t("cloudConfirmIntro", {}, language)}
        </p>

        <div className="cloud-card">
          <strong style={{ fontSize: "0.92rem", color: "var(--text-primary)" }}>
            {t("cloudCounts", counts, language)}
          </strong>
        </div>

        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {t("cloudKeepLocal", {}, language)}
        </p>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
          {t("cloudNotSynced", {}, language)}
        </p>
      </div>
    );

    footer = (
      <>
        <button type="button" className="btn btn-secondary" onClick={closeModal}>
          {t("cloudCancel", {}, language)}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleStartBackup}
          disabled={counts.challenges === 0}
        >
          ☁️ {t("cloudStart", {}, language)}
        </button>
      </>
    );
  } else if (step === "progress") {
    title = t("cloudWorking", {}, language);
    const total = progressState
      ? progressState.challengesTotal + progressState.completionsTotal + progressState.notesTotal
      : 1;
    const done = progressState
      ? progressState.challengesDone + progressState.completionsDone + progressState.notesDone
      : 0;
    const percent = Math.min(100, Math.round((done / Math.max(1, total)) * 100));

    content = (
      <div className="modal-content-stack">
        <p className="modal-body-text">
          {t("cloudValidating", {}, language)}
        </p>

        {progressState && (
          <p style={{ margin: 0, fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {t("cloudProgress", progressState, language)}
          </p>
        )}

        <ProgressBar value={percent} />

        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
          {t("cloudKeepLocal", {}, language)}
        </p>
      </div>
    );

    footer = null;
  } else if (step === "result") {
    const isSuccess = resultState?.resultKey === "cloudComplete";
    title = t(isSuccess ? "cloudComplete" : "cloudBackup", {}, language);

    content = (
      <div className="modal-content-stack">
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: isSuccess ? "var(--color-success-bg)" : "var(--color-danger-bg)",
            color: isSuccess ? "var(--color-success-text)" : "var(--color-danger)",
            fontSize: "0.92rem",
            fontWeight: 600,
          }}
          role="status"
        >
          {t(resultState?.resultKey || "cloudNothing", {}, language)}
        </div>

        {resultState?.counts && (
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-primary)" }}>
            {t("cloudResultCounts", resultState.counts, language)}
          </p>
        )}

        <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-muted)" }}>
          {t("cloudLocalSafe", {}, language)}
        </p>
      </div>
    );

    footer = (
      <>
        {!isSuccess && (
          <button type="button" className="btn btn-primary" onClick={handleStartBackup}>
            {t("cloudRetry", {}, language)}
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={closeModal}>
          {t("cloudDismiss", {}, language)}
        </button>
      </>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={title}
      footer={footer}
    >
      {content}
    </Modal>
  );
}

export default BackupModal;
