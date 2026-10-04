import React, { useEffect, useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useTimezone } from "../../hooks/useTimezone.js";
import { normalizeDisplayName } from "../../utils/profile.js";
import { isValidTimezone } from "../../utils/date.js";
import { t } from "../../i18n/index.js";

export function SettingsModal() {
  const { isAuthenticated, user, updateProfile } = useAuth();
  const { language, setLanguage, localDisplayName, setLocalDisplayName } = useStreaks();
  const { timezone, browserTimezone, setTimezone } = useTimezone();
  const { modalMode, closeModal, openModal } = useNavigation();
  const isOpen = modalMode === "settings";

  const [name, setName] = useState("");
  const [timezoneValue, setTimezoneValue] = useState(timezone);
  const [savingName, setSavingName] = useState(false);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [noticeKey, setNoticeKey] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(isAuthenticated ? user?.displayName || "" : localDisplayName);
    setTimezoneValue(timezone);
    setErrorKey(null);
    setNoticeKey(null);
  }, [isOpen]);

  const saveName = async (event) => {
    event.preventDefault();
    setErrorKey(null);
    setNoticeKey(null);
    const normalized = normalizeDisplayName(name);
    if (normalized === null || (isAuthenticated && !normalized)) {
      setErrorKey("profileNameInvalid");
      return;
    }

    setSavingName(true);
    const result = isAuthenticated
      ? await updateProfile(normalized)
      : { success: setLocalDisplayName(normalized) };
    setSavingName(false);
    if (result.success) {
      setName(normalized);
      setNoticeKey("settingsSaved");
    } else {
      setErrorKey(result.errorKey || "profileSaveFailed");
    }
  };

  const saveTimezone = async (event) => {
    event.preventDefault();
    setErrorKey(null);
    setNoticeKey(null);
    if (!isValidTimezone(timezoneValue.trim())) {
      setErrorKey("timezoneInvalid");
      return;
    }
    setSavingTimezone(true);
    const saved = await setTimezone(timezoneValue.trim());
    setSavingTimezone(false);
    if (saved) setNoticeKey("settingsSaved");
    else setErrorKey("timezoneSaveFailed");
  };

  const changeLanguage = async (event) => {
    setErrorKey(null);
    setNoticeKey(null);
    const result = await setLanguage(event.target.value);
    if (result?.ok) setNoticeKey("settingsSaved");
    else setErrorKey("profileSaveFailed");
  };

  const footer = (
    <>
      {!isAuthenticated && (
        <button type="button" className="btn btn-secondary" onClick={() => openModal("auth")}>
          {t("authLogin", {}, language)}
        </button>
      )}
      {isAuthenticated && (
        <button type="button" className="btn btn-secondary" onClick={() => openModal("auth")}>
          {t("settingsAccountSync", {}, language)}
        </button>
      )}
      <button type="button" className="btn btn-secondary" onClick={closeModal}>
        {t("authClose", {}, language)}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={t("settingsTitle", {}, language)}
      footer={footer}
      maxWidth={520}
      closeLabel={t("authClose", {}, language)}
    >
      <div className="modal-content-stack">
        {isAuthenticated && user?.email && (
          <div className="form-group">
            <label htmlFor="settingsEmail" className="form-label">{t("settingsEmail", {}, language)}</label>
            <input
              id="settingsEmail"
              className="form-input"
              type="email"
              value={user.email}
              readOnly
            />
            <span className="modal-body-text">{t("settingsEmailReadOnly", {}, language)}</span>
          </div>
        )}

        <form className="modal-form" onSubmit={saveName}>
          <div className="form-group">
            <label htmlFor="settingsDisplayName" className="form-label">
              {t("settingsDisplayName", {}, language)}
            </label>
            <input
              id="settingsDisplayName"
              className="form-input"
              type="text"
              value={name}
              maxLength={50}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              aria-describedby="settingsNameHint"
            />
            <span id="settingsNameHint" className="modal-body-text">
              {t("settingsNameHint", {}, language)}
            </span>
          </div>
          <button type="submit" className="btn btn-primary" disabled={savingName}>
            {savingName ? t("settingsSaving", {}, language) : t("settingsSaveName", {}, language)}
          </button>
        </form>

        <div className="form-group">
          <label htmlFor="settingsLanguage" className="form-label">{t("languageLabel", {}, language)}</label>
          <select
            id="settingsLanguage"
            className="form-select"
            value={language}
            onChange={changeLanguage}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>

        <form className="modal-form" onSubmit={saveTimezone}>
          <div className="form-group">
            <label htmlFor="settingsTimezone" className="form-label">{t("timezoneLabel", {}, language)}</label>
            <input
              id="settingsTimezone"
              className="form-input"
              type="text"
              value={timezoneValue}
              onChange={(event) => setTimezoneValue(event.target.value)}
              autoComplete="off"
              spellCheck="false"
              aria-describedby="settingsTimezoneHint"
            />
            <span id="settingsTimezoneHint" className="modal-body-text">
              {t("timezoneHint", {}, language)} {browserTimezone}
            </span>
          </div>
          <button type="submit" className="btn btn-secondary" disabled={savingTimezone}>
            {savingTimezone ? t("settingsSaving", {}, language) : t("timezoneSave", {}, language)}
          </button>
        </form>

        {(errorKey || noticeKey) && (
          <p className={errorKey ? "form-error" : "form-notice"} role={errorKey ? "alert" : "status"}>
            {t(errorKey || noticeKey, {}, language)}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default SettingsModal;
