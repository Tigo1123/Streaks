import React, { useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useSync } from "../../hooks/useSync.js";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { t } from "../../i18n/index.js";

export function AuthModal() {
  const {
    isAuthenticated,
    user,
    status: authStatus,
    login,
    register,
    logout,
    formErrorKey,
    noticeKey,
    isSubmitting,
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

  const isOpen = modalMode === "auth";
  const isRtl = language === "ar";

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!email || !password) {
      setLocalError("Please fill in all fields");
      return;
    }

    const res = await login(email, password);
    if (res.success) {
      showToast(isRtl ? "تم تسجيل الدخول بنجاح" : "Signed in successfully");
      setEmail("");
      setPassword("");
      closeModal();
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!email || !password || !confirmPassword) {
      setLocalError("Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      setLocalError(t("authPasswordTooShort", {}, language) || "Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError(t("authPasswordMismatch", {}, language) || "Passwords do not match");
      return;
    }

    const res = await register(email, password);
    if (res.success) {
      showToast(isRtl ? "تم إنشاء الحساب وتسجيل الدخول" : "Account created and signed in!");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      closeModal();
    }
  };

  const handleLogout = () => {
    logout();
    showToast(t("authLogoutSuccess", {}, language) || (isRtl ? "تم تسجيل الخروج" : "Signed out"));
    closeModal();
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
        title={isRtl ? "حسابك" : "Account"}
        footer={footer}
      >
        <div className="modal-content-stack">
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
              {isSyncRunning ? t("syncing", {}, language) : (isRtl ? "مزامنة الآن" : "Sync Now")}
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

  // Unauthenticated: Login or Register
  const isRegister = authView === "register";
  const modalTitle = isRegister
    ? (isRtl ? "إنشاء حساب" : "Create your account")
    : (isRtl ? "مرحباً بعودتك" : "Welcome back");

  const modalSubtitle = isRegister
    ? (isRtl ? "زامِن تقدمك وسلاسل عاداتك عبر مختلف الأجهزة." : "Sync your progress across devices.")
    : (isRtl ? "واصل بناء سلسلة إنجازاتك اليومية." : "Continue building your streak.");

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={closeModal}>
        {t("authClose", {}, language)}
      </button>
      <button
        type="submit"
        form={isRegister ? "registerForm" : "loginForm"}
        className="btn btn-primary"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? t(isRegister ? "authWorkingRegister" : "authWorkingLogin", {}, language)
          : isRegister
          ? (isRtl ? "إنشاء الحساب" : "Create account")
          : (isRtl ? "تسجيل الدخول" : "Sign in")}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={modalTitle}
      footer={footer}
    >
      <div className="modal-content-stack">
        <p className="modal-subtitle">{modalSubtitle}</p>

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
            />
          </div>

          <div className="form-group">
            <label htmlFor="authPasswordInput" className="form-label">
              {t("authPassword", {}, language)}
            </label>
            <input
              id="authPasswordInput"
              type="password"
              className="form-input"
              required
              minLength={isRegister ? 8 : undefined}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label htmlFor="authConfirmInput" className="form-label">
                {t("authConfirmPassword", {}, language)}
              </label>
              <input
                id="authConfirmInput"
                type="password"
                className="form-input"
                required
                minLength={8}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {(localError || formErrorKey) && (
            <div className="form-error" role="alert">
              {localError || t(formErrorKey, {}, language)}
            </div>
          )}
        </form>

        <div className="auth-switch-wrap">
          <span className="auth-switch-text">
            {isRegister
              ? (isRtl ? "لديك حساب بالفعل؟" : "Already have an account?")
              : (isRtl ? "ليس لديك حساب؟" : "Don't have an account?")}
          </span>
          <button
            type="button"
            className="auth-switch-btn"
            onClick={() => {
              setAuthView(isRegister ? "login" : "register");
              setLocalError("");
            }}
          >
            {isRegister
              ? (isRtl ? "تسجيل الدخول" : "Sign in")
              : (isRtl ? "إنشاء حساب" : "Create one")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AuthModal;
