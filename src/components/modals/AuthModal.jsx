import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useSync } from "../../hooks/useSync.js";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { t } from "../../i18n/index.js";
import { loadGoogleIdentity, shouldShowGoogleSignIn } from "../../services/googleAuth.js";

export function AuthModal() {
  const {
    isAuthenticated,
    hasSession,
    user,
    status: authStatus,
    connectionStatus,
    login,
    loginWithGoogle,
    register,
    logout,
    retrySession,
    formErrorKey,
    noticeKey,
    isSubmitting,
    clearErrors,
  } = useAuth();

  const { status: syncStatus, isRunning: isSyncRunning, startSync } = useSync();
  const { challenges, language } = useStreaks();
  const { modalMode, closeModal, openModal } = useNavigation();
  const { showToast } = useToast();

  const [authView, setAuthView] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [googleLinkCredential, setGoogleLinkCredential] = useState(null);
  const [googleLinkPassword, setGoogleLinkPassword] = useState("");
  const [googleScriptStatus, setGoogleScriptStatus] = useState("idle");
  const googleButtonRef = useRef(null);

  const isOpen = modalMode === "auth";
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";

  useEffect(() => {
    if (!isOpen && googleLinkCredential) {
      setGoogleLinkCredential(null);
      setGoogleLinkPassword("");
    }
  }, [isOpen, googleLinkCredential]);

  const handleGoogleCredential = useCallback(async (credential) => {
    const result = await loginWithGoogle(credential);
    if (result.requiresPassword) {
      setGoogleLinkCredential(credential);
      setGoogleLinkPassword("");
      setLocalError("");
      return;
    }
    if (result.success) {
      showToast(t("authSuccess", {}, language));
      closeModal();
    }
  }, [loginWithGoogle, showToast, language, closeModal]);

  useEffect(() => {
    if (!shouldShowGoogleSignIn(googleClientId, authView) || !isOpen || googleLinkCredential) return undefined;
    let cancelled = false;
    setGoogleScriptStatus("loading");

    loadGoogleIdentity()
      .then((googleIdentity) => {
        if (cancelled || !googleButtonRef.current) return;
        googleIdentity.initialize({
          client_id: googleClientId,
          ux_mode: "popup",
          callback: ({ credential }) => {
            if (credential) handleGoogleCredential(credential);
          }
        });
        googleButtonRef.current.replaceChildren();
        googleIdentity.renderButton(googleButtonRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: language === "ar" ? "ar" : "en",
          width: Math.min(400, Math.max(200, googleButtonRef.current.clientWidth))
        });
        setGoogleScriptStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setGoogleScriptStatus("unavailable");
      });

    return () => { cancelled = true; };
  }, [googleClientId, isOpen, authView, googleLinkCredential, language, handleGoogleCredential]);

  const handleGoogleLink = async (event) => {
    event.preventDefault();
    setLocalError("");
    const result = await loginWithGoogle(googleLinkCredential, googleLinkPassword);
    if (result.success) {
      setGoogleLinkCredential(null);
      setGoogleLinkPassword("");
      showToast(t("authSuccess", {}, language));
      closeModal();
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!email.trim()) {
      setLocalError("authEmailRequired");
      return;
    }
    if (!e.currentTarget.elements.authEmailInput.validity.valid) {
      setLocalError("authInvalidEmail");
      return;
    }
    if (!password) {
      setLocalError("authPasswordRequired");
      return;
    }

    const res = await login(email, password);
    if (res.success) {
      showToast(t("authSuccess", {}, language));
      setEmail("");
      setPassword("");
      closeModal();
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!email.trim()) {
      setLocalError("authEmailRequired");
      return;
    }
    if (!e.currentTarget.elements.authEmailInput.validity.valid) {
      setLocalError("authInvalidEmail");
      return;
    }
    if (!password || !confirmPassword) {
      setLocalError("authPasswordRequired");
      return;
    }
    if (password.length < 8) {
      setLocalError("authPasswordShort");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError(t("authPasswordMismatch", {}, language) || "Passwords do not match");
      return;
    }

    const res = await register(email, password);
    if (res.success) {
      showToast(t("authRegisterSuccess", {}, language));
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      closeModal();
    }
  };

  const handleLogout = async () => {
    const revocation = logout();
    closeModal();
    const result = await revocation;
    showToast(t(result.revoked ? "authLogoutSuccess" : "authLogoutOffline", {}, language));
  };

  const handleStartBackup = () => {
    openModal("backup");
  };

  // Authenticated: Render Account View
  if (isAuthenticated && user) {
    const totalCompletions = challenges.reduce((sum, c) => sum + c.completedDays.length, 0);
    const totalNotes = challenges.filter((c) => Boolean(c.note)).length;

    const footer = (
      <>
        <button type="button" className="btn btn-secondary" onClick={closeModal}>
          {t("authClose", {}, language)}
        </button>
        <button type="button" className="btn btn-danger" onClick={handleLogout}>
          {t("authLogout", {}, language)}
        </button>
      </>
    );

    return (
      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        title={t("authAccountTitle", {}, language)}
        footer={footer}
        dialogClassName="auth-modal-dialog"
        closeLabel={t("authClose", {}, language)}
      >
        <div className="modal-content-stack">
          {connectionStatus !== "online" && (
            <div className="form-error-banner" role="status">
              {t(connectionStatus === "checking" ? "authChecking" : "authOfflineRetry", {}, language)}
              {connectionStatus === "offline" && (
                <button type="button" className="btn btn-secondary" onClick={retrySession}>
                  {t("authRetry", {}, language)}
                </button>
              )}
            </div>
          )}
          {/* Account Profile / Identity Section with Clear Logout Action */}
          <div className="account-section" aria-label={t("authAccount", {}, language)}>
            <div className="account-user-card">
              <div className="account-user-identity">
                <span className="account-avatar" aria-hidden="true">👤</span>
                <div className="account-user-details">
                  <span className="account-label">
                    {t("authSignedInAs", {}, language)}
                  </span>
                  <div className="account-email" title={user.email}>{user.email}</div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary account-logout-btn"
                onClick={handleLogout}
                aria-label={t("authLogout", {}, language)}
              >
                <span aria-hidden="true" style={{ fontSize: "0.95rem" }}>🚪</span>
                <span>{t("authLogout", {}, language)}</span>
              </button>
            </div>
          </div>

          {/* Cloud Synchronization Section */}
          <div className="cloud-card">
            <div className="cloud-card-header">
              <span className="cloud-card-title">{t("syncAction", {}, language)}</span>
              <span className="badge badge-active" style={{ textTransform: "capitalize" }}>
                {isSyncRunning ? t("syncing", {}, language) : syncStatus}
              </span>
            </div>
            <p className="cloud-card-desc">{t("syncAutomaticNote", {}, language)}</p>
            <button
              type="button"
              className="btn btn-primary cloud-action-btn"
              onClick={startSync}
              disabled={isSyncRunning}
            >
              {isSyncRunning ? t("syncing", {}, language) : t("syncAction", {}, language)}
            </button>
            <p className="cloud-card-note">
              {t("syncTombstoneRule", {}, language)}
            </p>
          </div>

          {/* Cloud Backup Section */}
          <div className="cloud-card">
            <span className="cloud-card-title">{t("cloudLocalAvailable", {}, language)}</span>
            <p className="cloud-card-desc">{t("cloudBackupDescription", {}, language)}</p>
            <div className="cloud-card-counts">
              {t("cloudCounts", { challenges: challenges.length, completions: totalCompletions, notes: totalNotes }, language)}
            </div>
            <button
              type="button"
              className="btn btn-secondary cloud-action-btn"
              onClick={handleStartBackup}
            >
              ☁️ {t("cloudBackup", {}, language)}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (hasSession) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        title={t("authAccountTitle", {}, language)}
        dialogClassName="auth-modal-dialog"
        closeLabel={t("authClose", {}, language)}
      >
        <div className="modal-content-stack">
          <div className="form-error-banner" role="status">
            {t(connectionStatus === "checking" ? "authChecking" : "authOfflineRetry", {}, language)}
          </div>
          <button type="button" className="btn btn-secondary" onClick={retrySession}>
            {t("authRetry", {}, language)}
          </button>
          <button type="button" className="btn btn-danger" onClick={handleLogout}>
            {t("authLogout", {}, language)}
          </button>
        </div>
      </Modal>
    );
  }

  // Unauthenticated: Login or Register
  const isRegister = authView === "register";
  const modalTitle = t(isRegister ? "authRegisterTitle" : "authLoginTitle", {}, language);
  const modalSubtitle = t(isRegister ? "authRegisterSubtitle" : "authLoginSubtitle", {}, language);

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={closeModal}>
        {t("authClose", {}, language)}
      </button>
      <button
        type="submit"
        form={googleLinkCredential ? "googleLinkForm" : isRegister ? "registerForm" : "loginForm"}
        className="btn btn-primary auth-submit-btn"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? (
            <>
              <span className="auth-loading-indicator" aria-hidden="true" />
              <span aria-live="polite">{t(isRegister ? "authWorkingRegister" : "authWorkingLogin", {}, language)}</span>
            </>
          )
          : t(
            googleLinkCredential
              ? "authGoogleLinkConfirm"
              : isRegister ? "authCreateAccount" : "authLogin",
            {},
            language
          )}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={modalTitle}
      footer={footer}
      dialogClassName="auth-modal-dialog"
      closeLabel={t("authClose", {}, language)}
    >
      <div className="modal-content-stack">
        <p className="modal-subtitle">{modalSubtitle}</p>

        {googleLinkCredential ? (
          <>
            <p className="modal-subtitle">{t("authGoogleLinkPrompt", {}, language)}</p>
            <form id="googleLinkForm" onSubmit={handleGoogleLink} className="modal-form">
              <div className="form-group">
                <label htmlFor="googleLinkPassword" className="form-label">
                  {t("authGoogleLinkPassword", {}, language)}
                </label>
                <input
                  id="googleLinkPassword"
                  type="password"
                  className="form-input"
                  required
                  autoComplete="current-password"
                  value={googleLinkPassword}
                  onChange={(event) => setGoogleLinkPassword(event.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
            </form>
            {formErrorKey && (
              <div className="form-error" role="alert">
                {t(formErrorKey, {}, language)}
              </div>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setGoogleLinkCredential(null);
                setGoogleLinkPassword("");
                clearErrors();
              }}
              disabled={isSubmitting}
            >
              {t("authGoogleLinkCancel", {}, language)}
            </button>
          </>
        ) : (
          <>
            {shouldShowGoogleSignIn(googleClientId, authView) && (
              <div className="google-auth-wrap">
                {googleScriptStatus === "loading" && (
                  <p className="google-auth-status" role="status">
                    <span className="auth-loading-indicator" aria-hidden="true" />
                    {t("authGoogleLoading", {}, language)}
                  </p>
                )}
                {googleScriptStatus === "unavailable" && (
                  <p className="google-auth-status" role="status">
                    {t("authGoogleUnavailable", {}, language)}
                  </p>
                )}
                <div
                  ref={googleButtonRef}
                  className="google-auth-button"
                  aria-hidden={googleScriptStatus !== "ready"}
                />
                <div className="google-auth-divider" aria-hidden="true">
                  <span>{t("authOr", {}, language)}</span>
                </div>
              </div>
            )}

        {noticeKey && (
          <div className="form-notice" role="status">
            {t(noticeKey, {}, language)}
          </div>
        )}

        {authStatus === "backendUnavailable" && (
          <div className="form-error-banner" role="alert">
            {t("authBackendUnavailable", {}, language)}
          </div>
        )}

        <form
          id={isRegister ? "registerForm" : "loginForm"}
          onSubmit={isRegister ? handleRegisterSubmit : handleLoginSubmit}
          className="modal-form"
          aria-busy={isSubmitting}
          noValidate
        >
          <div className="form-group">
            <label htmlFor="authEmailInput" className="form-label">
              {t("authEmail", {}, language)}
            </label>
            <input
              id="authEmailInput"
              type="email"
              className="form-input"
              required
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="authPasswordInput" className="form-label">
              {t("authPassword", {}, language)}
            </label>
            <div className="auth-password-field">
              <input
                id="authPasswordInput"
                type={showPassword ? "text" : "password"}
                className="form-input"
                required
                minLength={isRegister ? 8 : undefined}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={t(showPassword ? "authHidePassword" : "authShowPassword", {}, language)}
                aria-pressed={showPassword}
                disabled={isSubmitting}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.5 5.1 9 6-.2.4-1.4 2.4-3.8 3.9M6.2 6.2C3.8 7.7 2.2 10.1 2 11c.4.8 3.7 8 10 8 1.1 0 2.1-.2 3-.6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M2 12s3.3-7 10-7 10 7 10 7-3.3 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {isRegister && (
            <div className="form-group">
              <label htmlFor="authConfirmInput" className="form-label">
                {t("authConfirmPassword", {}, language)}
              </label>
              <input
                id="authConfirmInput"
                type={showPassword ? "text" : "password"}
                className="form-input"
                required
                minLength={8}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </div>
          )}

          {(localError || formErrorKey) && (
            <div className="form-error" role="alert">
              {localError ? t(localError, {}, language) : t(formErrorKey, {}, language)}
            </div>
          )}
        </form>

        <div className="auth-switch-wrap">
          <button
            type="button"
            className="auth-switch-btn"
            onClick={() => {
              setAuthView(isRegister ? "login" : "register");
              setLocalError("");
              clearErrors();
              setShowPassword(false);
            }}
            disabled={isSubmitting}
          >
            {t(isRegister ? "authAlreadyAccount" : "authNeedAccount", {}, language)}
          </button>
        </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default AuthModal;
