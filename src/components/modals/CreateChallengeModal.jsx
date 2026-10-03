import React, { useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { localToday } from "../../utils/date.js";
import { t } from "../../i18n/index.js";

export function CreateChallengeModal() {
  const { createChallenge, language } = useStreaks();
  const { modalMode, closeModal } = useNavigation();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [durationPreset, setDurationPreset] = useState("30");
  const [customDuration, setCustomDuration] = useState("");
  const [startDate, setStartDate] = useState(localToday());
  const [error, setError] = useState("");

  const isOpen = modalMode === "create";
  const isRtl = language === "ar";

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("nameRequired", {}, language) || "Please enter a challenge name");
      return;
    }

    const durationDays = durationPreset === "custom"
      ? parseInt(customDuration, 10)
      : parseInt(durationPreset, 10);

    if (isNaN(durationDays) || durationDays < 1 || durationDays > 365) {
      setError(isRtl ? "يجب أن تكون المدة بين 1 و 365 يوماً" : "Duration must be between 1 and 365 days");
      return;
    }

    createChallenge({
      name: trimmedName,
      durationDays,
      startDate: startDate || localToday(),
    });

    showToast(isRtl ? "تم إنشاء التحدي بنجاح" : "Challenge created!");
    setName("");
    setDurationPreset("30");
    setCustomDuration("");
    setStartDate(localToday());
    setError("");
    closeModal();
  };

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={closeModal}>
        {t("cancel", {}, language)}
      </button>
      <button type="submit" form="createChallengeForm" className="btn btn-primary">
        {t("save", {}, language)}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={isRtl ? "تحدٍ جديد" : "Create Challenge"}
      footer={footer}
    >
      <form id="createChallengeForm" onSubmit={handleSubmit} className="modal-form">
        <div className="form-group">
          <label htmlFor="challengeNameInput" className="form-label">
            {t("name", {}, language)}
          </label>
          <input
            id="challengeNameInput"
            type="text"
            className="form-input"
            maxLength={80}
            required
            placeholder={isRtl ? "مثال: القراءة اليومية، الركض الصباحي" : "e.g. Read 30 minutes, Morning run"}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="challengeDurationSelect" className="form-label">
            {t("duration", {}, language)}
          </label>
          <select
            id="challengeDurationSelect"
            className="form-select"
            value={durationPreset}
            onChange={(e) => setDurationPreset(e.target.value)}
          >
            <option value="7">7 {t("days", {}, language)}</option>
            <option value="10">10 {t("days", {}, language)}</option>
            <option value="21">21 {t("days", {}, language)} (Habit loop)</option>
            <option value="30">30 {t("days", {}, language)} (1 month)</option>
            <option value="60">60 {t("days", {}, language)} (2 months)</option>
            <option value="90">90 {t("days", {}, language)} (Quarter)</option>
            <option value="custom">{t("custom", {}, language)}…</option>
          </select>

          {durationPreset === "custom" && (
            <input
              type="number"
              className="form-input"
              min={1}
              max={365}
              placeholder="1–365"
              required
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              style={{ marginTop: "var(--space-2)" }}
            />
          )}
        </div>

        <div className="form-group">
          <label htmlFor="challengeStartDateInput" className="form-label">
            {t("startDate", {}, language)}
          </label>
          <input
            id="challengeStartDateInput"
            type="date"
            className="form-input"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

export default CreateChallengeModal;
