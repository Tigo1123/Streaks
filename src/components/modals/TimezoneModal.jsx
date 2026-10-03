import React, { useEffect, useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useTimezone } from "../../hooks/useTimezone.js";
import { isValidTimezone } from "../../utils/date.js";
import { t } from "../../i18n/index.js";

export function TimezoneModal() {
  const { language } = useStreaks();
  const { modalMode, closeModal } = useNavigation();
  const { timezone, browserTimezone, setTimezone } = useTimezone();
  const [value, setValue] = useState(timezone);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const isOpen = modalMode === "timezone";

  useEffect(() => {
    if (isOpen) {
      setValue(timezone);
      setError(false);
    }
  }, [isOpen, timezone]);

  const save = async (event) => {
    event.preventDefault();
    if (!isValidTimezone(value.trim())) {
      setError(true);
      return;
    }
    setSaving(true);
    const saved = await setTimezone(value.trim());
    setSaving(false);
    if (saved) closeModal();
  };

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={closeModal}>
        {t("cancel", {}, language)}
      </button>
      <button type="submit" form="timezoneForm" className="btn btn-primary" disabled={saving}>
        {t("timezoneSave", {}, language)}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title={t("timezoneTitle", {}, language)} footer={footer}>
      <form id="timezoneForm" className="modal-form" onSubmit={save}>
        <div className="form-group">
          <label className="form-label" htmlFor="timezoneInput">{t("timezoneLabel", {}, language)}</label>
          <input
            id="timezoneInput"
            className="form-input"
            type="text"
            autoComplete="off"
            spellCheck="false"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(false);
            }}
            aria-invalid={error}
            aria-describedby="timezoneHint"
            required
          />
          {error && <span className="form-error" role="alert">{t("timezoneInvalid", {}, language)}</span>}
        </div>
        <p id="timezoneHint" className="modal-body-text">{t("timezoneHint", {}, language)}</p>
        <p className="modal-body-text">
          {language === "ar" ? "المنطقة التي اكتشفها المتصفح: " : "Browser-detected: "}
          <code>{browserTimezone}</code>
        </p>
      </form>
    </Modal>
  );
}
