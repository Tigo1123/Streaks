import React, { useState, useEffect, useRef } from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useSync } from "../../hooks/useSync.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { t } from "../../i18n/index.js";

export function TopNav({ onToggleSidebar }) {
  const { language, setLanguage } = useStreaks();
  const { user, isAuthenticated, logout } = useAuth();
  const {
    status: syncStatus,
    isRunning: isSyncRunning,
    lastSyncedAt,
    startSync
  } = useSync();
  const { currentScreen, openModal } = useNavigation();
  const { showToast } = useToast();

  const isRtl = language === "ar";

  const toggleLanguage = async () => {
    await setLanguage(language === "en" ? "ar" : "en");
  };

  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  // Close account menu on click outside or Escape
  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setIsAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  const handleAccountClick = () => {
    if (!isAuthenticated) {
      openModal("auth");
      return;
    }
    setIsAccountMenuOpen((prev) => !prev);
  };

  const handleMenuLogout = async () => {
    setIsAccountMenuOpen(false);
    const result = await logout();
    showToast(t(result.revoked ? "authLogoutSuccess" : "authLogoutOffline", {}, language) || (isRtl ? "تم تسجيل الخروج" : "Signed out"));
  };

  const handleOpenAccountModal = () => {
    setIsAccountMenuOpen(false);
    openModal("auth");
  };

  const handleSyncClick = () => {
    if (!isAuthenticated) {
      openModal("auth");
      return;
    }
    startSync();
  };

  const syncStatusKey = isSyncRunning
    ? "syncStatusRunning"
    : syncStatus === "conflict"
    ? "syncStatusConflict"
    : syncStatus === "choice"
    ? "syncStatusChoice"
    : syncStatus === "offline"
    ? "syncStatusOffline"
    : ["error"].includes(syncStatus)
    ? "syncStatusError"
    : lastSyncedAt
    ? "syncStatusSynced"
    : "syncStatusNever";
  const syncStatusLabel = t(syncStatusKey, {}, language);
  const syncLastLabel = lastSyncedAt
    ? t("syncLast", {
      time: new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(new Date(lastSyncedAt))
    }, language)
    : t("syncNever", {}, language);
  const syncLabel = `${syncStatusLabel} · ${syncLastLabel}`;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
        <span className="page-title">
          {currentScreen === "detail"
            ? (isRtl ? "تفاصيل التحدي" : "Challenge Tracker")
            : (isRtl ? "لوحة المتابعة" : "Daily Momentum")}
        </span>
      </div>

      <div className="topbar-actions">
        {/* New Challenge - Clean restrained action */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openModal("create")}
          style={{ height: "34px", padding: "0 12px", fontSize: "0.84rem" }}
        >
          <span aria-hidden="true" style={{ fontWeight: 600 }}>＋</span>
          <span className="topbar-btn-text">{t("newChallenge", {}, language)}</span>
        </button>

        {/* Cloud Sync Status/Action */}
        {isAuthenticated && (
          <>
            <button
              type="button"
              className="btn-icon"
              onClick={handleSyncClick}
              disabled={isSyncRunning}
              aria-busy={isSyncRunning ? "true" : "false"}
              aria-label={syncLabel}
              title={syncLabel}
              style={{
                height: "34px",
                width: "34px",
                color: syncStatus === "conflict" ? "var(--color-danger)" : undefined
              }}
            >
              <span aria-hidden="true" style={{ fontSize: "0.95rem" }}>
                {isSyncRunning ? "⏳" : syncStatus === "conflict" ? "⚠️" : "☁️"}
              </span>
            </button>
            <span className="sync-status-indicator" role="status" aria-live="polite">
              <span>{syncStatusLabel}</span>
              <small>{syncLastLabel}</small>
            </span>
          </>
        )}

        {/* Language Switcher Pill */}
        <button
          type="button"
          className="btn-icon"
          onClick={() => openModal("timezone")}
          aria-label={t("timezoneTitle", {}, language)}
          title={t("timezoneTitle", {}, language)}
          style={{ height: "34px", width: "34px" }}
        >
          <span aria-hidden="true">🌐</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={toggleLanguage}
          aria-label={t("languageLabel", {}, language)}
          title={t("languageLabel", {}, language)}
          style={{ height: "34px", padding: "0 10px", fontSize: "0.78rem", fontWeight: 600 }}
        >
          {language === "en" ? "العربية" : "English"}
        </button>

        {/* Account Button & Clean Account Menu */}
        <div className="account-nav-wrapper" ref={accountMenuRef}>
          <button
            type="button"
            className="btn btn-secondary account-nav-btn"
            onClick={handleAccountClick}
            aria-haspopup={isAuthenticated ? "menu" : undefined}
            aria-expanded={isAuthenticated ? isAccountMenuOpen : undefined}
            aria-label={isAuthenticated ? `${t("authAccount", {}, language)}: ${user?.email}` : t("authAccountLabel", {}, language)}
            title={isAuthenticated ? `${user?.email} (${t("authAccount", {}, language)})` : t("authAccount", {}, language)}
          >
            <span aria-hidden="true" style={{ fontSize: "0.95rem" }}>👤</span>
            <span className="account-nav-btn-text">
              {isAuthenticated && user?.email
                ? (user.email.split("@")[0] || t("authAccount", {}, language))
                : t("authAccount", {}, language)}
            </span>
            {isAuthenticated && (
              <span aria-hidden="true" style={{ fontSize: "0.7rem", opacity: 0.65 }}>▾</span>
            )}
          </button>

          {isAuthenticated && isAccountMenuOpen && (
            <div className="account-dropdown-menu" role="menu" aria-label={t("authAccount", {}, language)}>
              <div className="account-dropdown-user">
                <span className="account-avatar" aria-hidden="true">👤</span>
                <div className="account-dropdown-user-info">
                  <span className="account-dropdown-label">{t("authSignedInAs", {}, language)}</span>
                  <span className="account-dropdown-email" title={user?.email}>{user?.email}</span>
                </div>
              </div>
              <div className="account-dropdown-divider" role="separator" />
              <button
                type="button"
                className="account-dropdown-item account-dropdown-logout"
                role="menuitem"
                onClick={handleMenuLogout}
              >
                <span aria-hidden="true">🚪</span>
                <span>{t("authLogout", {}, language)}</span>
              </button>
              <button
                type="button"
                className="account-dropdown-item"
                role="menuitem"
                onClick={handleOpenAccountModal}
              >
                <span aria-hidden="true">⚙️</span>
                <span>{isRtl ? "تفاصيل الحساب والمزامنة" : "Account details & sync"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopNav;
