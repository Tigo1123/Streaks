import React, { useState, useEffect } from "react";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useSync } from "../../hooks/useSync.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { t } from "../../i18n/index.js";

export function Sidebar({ isOpen, isMobile = false, onClose, sidebarRef }) {
  const { language } = useStreaks();
  const { status: syncStatus, isRunning: isSyncRunning } = useSync();
  const { currentScreen, goBack, openModal } = useNavigation();
  const { isAuthenticated, user, logout } = useAuth();
  const { showToast } = useToast();

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleNavClick = (action) => {
    onClose?.();
    if (action === "overview") {
      goBack();
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else if (action === "challenges") {
      if (currentScreen === "detail") {
        goBack();
      }
      if (typeof window !== "undefined") {
        setTimeout(() => {
          const el = document.getElementById("challenges-section");
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
          }
        }, 50);
      }
    } else if (action === "account") {
      openModal("auth");
    } else if (action === "import-export") {
      openModal("import-export");
    }
  };

  const handleLogout = async () => {
    onClose?.();
    const result = await logout();
    showToast(t(result.revoked ? "authLogoutSuccess" : "authLogoutOffline", {}, language) || (isRtl ? "تم تسجيل الخروج" : "Signed out"));
  };

  const isRtl = language === "ar";

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? "active" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="main-sidebar"
        ref={sidebarRef}
        className={`sidebar ${isOpen ? "open" : ""}`}
        aria-label={t("mainNavigation", {}, language)}
        aria-hidden={isMobile && !isOpen}
        inert={isMobile && !isOpen ? "" : undefined}
      >
        <div className="sidebar-header">
          <a
            href="#"
            className="brand-link"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick("overview");
            }}
          >
            <span className="brand-mark" aria-hidden="true">🔥</span>
            <span>STREAKS</span>
          </a>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item ${currentScreen === "dashboard" ? "active" : ""}`}
            onClick={() => handleNavClick("overview")}
          >
            <span className="nav-icon" aria-hidden="true">○</span>
            <span>{isRtl ? "نظرة عامة" : "Overview"}</span>
          </button>

          <button
            type="button"
            className={`nav-item ${currentScreen === "detail" ? "active" : ""}`}
            onClick={() => handleNavClick("challenges")}
          >
            <span className="nav-icon" aria-hidden="true">⊞</span>
            <span>{isRtl ? "التحديات" : "Challenges"}</span>
          </button>

          <div className="nav-divider" role="separator" />

          <button
            type="button"
            className="nav-item"
            onClick={() => handleNavClick("account")}
          >
            <span className="nav-icon" aria-hidden="true">👤</span>
            <span>
              {isAuthenticated && user?.email
                ? `${t("authAccount", {}, language)} (${user.email.split("@")[0]})`
                : t("authAccount", {}, language)}
            </span>
          </button>

          {isAuthenticated && (
            <button
              type="button"
              className="nav-item sidebar-logout-btn"
              onClick={handleLogout}
              style={{ color: "var(--color-danger)" }}
            >
              <span className="nav-icon" aria-hidden="true">🚪</span>
              <span>{t("authLogout", {}, language)}</span>
            </button>
          )}

          <button
            type="button"
            className="nav-item"
            onClick={() => handleNavClick("import-export")}
          >
            <span className="nav-icon" aria-hidden="true">⇅</span>
            <span>{t("export", {}, language)} / {t("import", {}, language)}</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <span
              className="status-dot"
              style={{
                backgroundColor: !isOnline
                  ? "var(--color-warning)"
                  : isSyncRunning
                  ? "var(--color-primary)"
                  : "var(--color-success)"
              }}
              aria-hidden="true"
            />
            <span>
              {!isOnline
                ? (isRtl ? "غير متصل" : "Offline")
                : isSyncRunning
                ? (isRtl ? "مزامنة…" : "Syncing…")
                : (isRtl ? "جاهز ومحفوظ محلياً" : "Ready · Saved locally")}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
