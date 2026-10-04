import React from "react";
import { Modal } from "../common/Modal.jsx";
import { useSync } from "../../hooks/useSync.js";
import { useStreaks } from "../../hooks/useStreaks.js";
import { t } from "../../i18n/index.js";

export function SyncOnboardingModal() {
  const { firstSyncPrompt, chooseInitialSync, isRunning } = useSync();
  const { language } = useStreaks();

  if (!firstSyncPrompt) return null;

  return (
    <Modal
      isOpen
      preventClose
      title={t("syncFirstChoiceTitle", {}, language)}
      dialogClassName="auth-modal-dialog"
    >
      <div className="modal-content-stack">
        <p className="modal-body-text">
          {t("syncFirstChoiceIntro", { count: firstSyncPrompt.localCount }, language)}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => chooseInitialSync("upload")}
          disabled={isRunning}
        >
          {t("syncFirstUpload", {}, language)}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => chooseInitialSync("empty")}
          disabled={isRunning}
        >
          {t("syncFirstEmpty", {}, language)}
        </button>
        <p className="modal-body-text">
          {t("syncFirstEmptyDetail", {}, language)}
        </p>
      </div>
    </Modal>
  );
}

export default SyncOnboardingModal;
