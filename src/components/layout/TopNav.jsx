import React, { useState, useEffect, useRef } from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useSync } from "../../hooks/useSync.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { t } from "../../i18n/index.js";
import { LineIcon } from "../common/LineIcon.jsx";

export function TopNav({ onToggleSidebar, isSidebarOpen, menuButtonRef }) {
  const { language, setLanguage, localDisplayName } = useStreaks();
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
  const accountButtonRef = useRef(null);

  // Close account menu on click outside or Escape
  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (e) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target) &&
        !accountButtonRef.current?.contains(e.target)
      ) {
        setIsAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsAccountMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  const handleAccountClick = () => {
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

  const handleOpenSettings = () => {
    setIsAccountMenuOpen(false);
    openModal("settings");
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
  const displayName = isAuthenticated ? user?.displayName || "" : localDisplayName;
  const accountLabel = displayName || t("authAccount", {}, language);
  const accountInitial = displayName ? Array.from(displayName.trim())[0]?.toLocaleUpperCase() : "•";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-menu-btn topbar-menu-btn"
          ref={menuButtonRef}
          onClick={onToggleSidebar}
          aria-label={t(isSidebarOpen ? "closeNavigationMenu" : "openNavigationMenu", {}, language)}
          aria-expanded={isSidebarOpen}
          aria-controls="main-sidebar"
        >
          ☰
        </button>
        <span className="page-title topbar-page-title">
          {currentScreen === "detail"
            ? (isRtl ? "تفاصيل التحدي" : "Challenge Tracker")
            : (isRtl ? "لوحة المتابعة" : "Daily Momentum")}
        </span>
      </div>

      <div className="topbar-actions">
        {/* New Challenge - Clean restrained action */}
        <button
          type="button"
          className="btn btn-primary topbar-create-btn"
          onClick={() => openModal("create")}
          aria-label={t("newChallenge", {}, language)}
          style={{ height: "34px", padding: "0 12px", fontSize: "0.84rem" }}
        >
          <LineIcon name="plus" size={20} />
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

        {/* Account Button & Clean Account Menu */}
        <div className="account-nav-wrapper" ref={accountMenuRef}>
          <button
            type="button"
            ref={accountButtonRef}
            className="btn btn-secondary account-nav-btn"
            onClick={handleAccountClick}
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
            aria-label={`${t("authAccount", {}, language)}: ${accountLabel}`}
            title={accountLabel}
          >
            <span aria-hidden="true" className="account-nav-initial">
              {displayName ? accountInitial : <LineIcon name="user" size={21} />}
            </span>
            <span className="account-nav-btn-text">
              {accountLabel}
            </span>
            <span aria-hidden="true" style={{ fontSize: "0.7rem", opacity: 0.65 }}>▾</span>
          </button>

          {isAccountMenuOpen && (
            <div className="account-dropdown-menu" role="menu" aria-label={t("authAccount", {}, language)}>
              <div className="account-dropdown-user">
                <span className="account-avatar" aria-hidden="true">{accountInitial}</span>
                <div className="account-dropdown-user-info">
                  <span className="account-dropdown-label">
                    {isAuthenticated ? t("authSignedInAs", {}, language) : t("authAccount", {}, language)}
                  </span>
                  <span className="account-dropdown-name">{accountLabel}</span>
                </div>
              </div>
              <div className="account-dropdown-divider" role="separator" />
              <button
                type="button"
                className="account-dropdown-item"
                role="menuitem"
                onClick={handleOpenSettings}
              >
                <span aria-hidden="true">⚙</span>
                <span>{t("settingsTitle", {}, language)}</span>
              </button>
              <button
                type="button"
                className="account-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  openModal("timezone");
                }}
              >
                <LineIcon name="globe" />
                <span>{t("timezoneTitle", {}, language)}</span>
              </button>
              <button
                type="button"
                className="account-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  toggleLanguage();
                }}
              >
                <span aria-hidden="true" className="account-menu-language-mark">文</span>
                <span>{t("languageLabel", {}, language)}</span>
                <span className="account-menu-language-value">{language === "en" ? "العربية" : "English"}</span>
              </button>
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    className="account-dropdown-item"
                    role="menuitem"
                    onClick={handleOpenAccountModal}
                  >
                    <span aria-hidden="true">☁</span>
                    <span>{t("settingsAccountSync", {}, language)}</span>
                  </button>
                  <button
                    type="button"
                    className="account-dropdown-item account-dropdown-logout"
                    role="menuitem"
                    onClick={handleMenuLogout}
                  >
                    <span aria-hidden="true">🚪</span>
                    <span>{t("authLogout", {}, language)}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="account-dropdown-item"
                  role="menuitem"
                  onClick={handleOpenAccountModal}
                >
                  <span aria-hidden="true">↪</span>
                  <span>{t("authLogin", {}, language)}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopNav;
