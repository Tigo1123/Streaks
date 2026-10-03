import React from "react";
import { Modal } from "../common/Modal.jsx";
import { useSync } from "../../hooks/useSync.js";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { t } from "../../i18n/index.js";

function formatConflictValue(val, language) {
  if (val === null || val === undefined) return t("cloudNothing", {}, language);
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

export function SyncConflictModal() {
  const { conflicts, conflictIndex, resolveConflict, status } = useSync();
  const { language } = useStreaks();
  const { modalMode, closeModal } = useNavigation();

  const isOpen = modalMode === "conflict" || (status === "conflict" && conflicts.length > 0 && modalMode !== "auth");

  if (!conflicts || conflicts.length === 0 || conflictIndex >= conflicts.length) {
    return null;
  }

  const conflict = conflicts[conflictIndex];
  const isRtl = language === "ar";

  const localText = conflict.kind === "delete-local"
    ? t("syncLocalDeleted", {}, language)
    : formatConflictValue(conflict.localValue, language);

  const cloudText = conflict.kind === "delete-cloud"
    ? t("syncCloudDeleted", {}, language)
    : formatConflictValue(conflict.cloudValue, language);

  const conflictHeading = conflict.kind === "note"
    ? t("syncNoteConflict", {}, language)
    : t("syncChallengeConflict", {}, language);

  const footer = (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => resolveConflict(conflict.key, "local")}
      >
        💻 {t("syncKeepLocal", {}, language)}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => resolveConflict(conflict.key, "cloud")}
      >
        ☁️ {t("syncKeepCloud", {}, language)}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={t("syncConflictTitle", {}, language)}
      footer={footer}
    >
      <div className="modal-content-stack">
        <p className="modal-body-text">
          {t("syncConflictIntro", {}, language)} ({conflictIndex + 1} / {conflicts.length})
        </p>

        <div>
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            {conflictHeading}:
          </span>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
            {conflict.title || conflict.key}
          </div>
        </div>

        <div className="sync-values">
          <div className="sync-value">
            <strong>{t("syncLocalValue", {}, language)}</strong>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {localText}
            </pre>
          </div>

          <div className="sync-value">
            <strong>{t("syncCloudValue", {}, language)}</strong>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {cloudText}
            </pre>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {isRtl ? "اختر النسخة التي ترغب بالاحتفاظ بها لحل هذا التعارض." : "Select which version you want to preserve to resolve this sync conflict."}
        </p>
      </div>
    </Modal>
  );
}

export default SyncConflictModal;
