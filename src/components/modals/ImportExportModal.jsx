import React, { useRef } from "react";
import { Modal } from "../common/Modal.jsx";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { t } from "../../i18n/index.js";

export function ImportExportModal() {
  const { exportData, importData, language } = useStreaks();
  const { modalMode, closeModal } = useNavigation();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  const isOpen = modalMode === "import-export";
  const isRtl = language === "ar";

  const handleExport = () => {
    exportData();
    showToast(isRtl ? "تم تحميل ملف البيانات بنجاح" : "Data exported successfully");
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const confirmed = window.confirm(t("importConfirm", {}, language));
      if (!confirmed) return;

      const result = importData(parsed);
      if (result !== true) return;
      showToast(t("importDone", {}, language));
      closeModal();
    } catch (error) {
      if (error?.message !== "saveFailed") showToast(t("importBad", {}, language), "danger");
    }
  };

  const footer = (
    <button type="button" className="btn btn-secondary" onClick={closeModal}>
      {t("cancel", {}, language)}
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={`${t("export", {}, language)} / ${t("import", {}, language)}`}
      footer={footer}
    >
      <div className="modal-content-stack">
        {/* Export Card */}
        <div className="cloud-card">
          <span className="cloud-card-title">💾 {t("export", {}, language)}</span>
          <p className="cloud-card-desc">
            {isRtl
              ? "تحميل ملف نسخة احتياطية محلية بتنسيق JSON يحتوي على كافة تحدياتك وسجلاتك."
              : "Download a local JSON backup file containing all your challenges, completions, and notes."}
          </p>
          <button
            type="button"
            className="btn btn-primary cloud-action-btn"
            onClick={handleExport}
          >
            📥 {t("export", {}, language)} (JSON)
          </button>
        </div>

        {/* Import Card */}
        <div className="cloud-card">
          <span className="cloud-card-title">📂 {t("import", {}, language)}</span>
          <p className="cloud-card-desc">
            {isRtl
              ? "استيراد بيانات Streaks من ملف JSON محلي محفوظ سابقاً. سيتم استبدال البيانات الحالية."
              : "Restore Streaks data from an existing JSON backup file. Current data will be replaced."}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="btn btn-secondary cloud-action-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            📤 {t("import", {}, language)}…
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ImportExportModal;
